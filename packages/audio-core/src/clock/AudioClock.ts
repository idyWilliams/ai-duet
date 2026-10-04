import type {
  IClock,
  ProbeReading,
  TempoChange,
  TimeSignatureChange,
} from './types.js';
import {
  seconds,
  beat,
  bar,
  ok,
  err,
  type SecondsTime,
  type BeatTime,
  type BarTime,
  type AudioClockError,
  type Result,
} from '../types/index.js';
import { AudioClockError as AudioClockErrorClass } from '../types/errors.js';

export class AudioClock implements IClock {
  private readonly audioTimeProvider: () => number;
  private readonly startAudioTime: SecondsTime;
  private tempoChanges: TempoChange[];
  private timeSigChanges: TimeSignatureChange[];

  constructor(
    audioTimeProvider: () => number,
    startAudioTime: SecondsTime,
    initialBpm: number,
    beatsPerBar: number,
    beatUnit: number = 4
  ) {
    this.audioTimeProvider = audioTimeProvider;
    this.startAudioTime = startAudioTime;
    this.tempoChanges = [{ at: startAudioTime, value: initialBpm }];
    this.timeSigChanges = [
      { at: startAudioTime, beatsPerBar, beatUnit },
    ];
  }

  now(): SecondsTime {
    return seconds(this.audioTimeProvider());
  }

  currentBeat(): BeatTime {
    return this.secondsToBeat(this.now());
  }

  currentBar(): BarTime {
    return this.beatToBar(this.currentBeat(), this.now());
  }

  secondsToBeat(s: SecondsTime): BeatTime {
    if (s <= this.startAudioTime) {
      return beat(0);
    }

    let accumulatedBeats = 0;
    let cursorTime = this.startAudioTime;

    for (let i = 0; i < this.tempoChanges.length; i++) {
      const seg = this.tempoChanges[i] as TempoChange;
      const nextSeg = this.tempoChanges[i + 1];
      const segStart = seg.at;
      const segEnd = nextSeg !== undefined ? nextSeg.at : s;

      const effectiveStart = seconds(Math.max(cursorTime as number, segStart as number));
      const effectiveEnd = seconds(Math.min(segEnd as number, s as number));

      if (effectiveEnd > effectiveStart) {
        const dt = (effectiveEnd as number) - (effectiveStart as number);
        accumulatedBeats += (seg.value / 60) * dt;
      }

      cursorTime = effectiveEnd;
      if (cursorTime >= s) break;
    }

    return beat(accumulatedBeats);
  }

  beatToSeconds(b: BeatTime): SecondsTime {
    if (b <= beat(0)) {
      return this.startAudioTime;
    }

    let remainingBeats = b as number;
    let accumulatedSeconds = this.startAudioTime as number;
    let segIndex = 0;

    while (remainingBeats > 0 && segIndex < this.tempoChanges.length) {
      const seg = this.tempoChanges[segIndex] as TempoChange;
      const nextSeg = this.tempoChanges[segIndex + 1];
      const segStart = seg.at;
      const segEndSecs = nextSeg !== undefined ? (nextSeg.at as number) : Number.POSITIVE_INFINITY;
      const segDurationSecs = segEndSecs - (segStart as number);

      const beatsInSeg = (seg.value / 60) * segDurationSecs;
      const beatsConsumed = Math.min(remainingBeats, beatsInSeg);
      const secsConsumed = (beatsConsumed * 60) / seg.value;

      accumulatedSeconds += secsConsumed;
      remainingBeats -= beatsConsumed;
      segIndex++;
    }

    if (remainingBeats > 0) {
      const lastSeg = this.tempoChanges[this.tempoChanges.length - 1] as TempoChange;
      accumulatedSeconds += (remainingBeats * 60) / lastSeg.value;
    }

    return seconds(accumulatedSeconds);
  }

  private beatToBar(b: BeatTime, atTime: SecondsTime): BarTime {
    if (b <= beat(0)) {
      return bar(0);
    }

    let remainingBeats = b as number;
    let accumulatedBars = 0;
    let cursorTime = this.startAudioTime;

    for (let i = 0; i < this.timeSigChanges.length; i++) {
      const seg = this.timeSigChanges[i] as TimeSignatureChange;
      const nextSeg = this.timeSigChanges[i + 1];
      const segStart = seg.at;
      const segEnd = nextSeg !== undefined ? nextSeg.at : atTime;

      const effectiveStart = seconds(Math.max(cursorTime as number, segStart as number));
      const effectiveEnd = seconds(Math.min(segEnd as number, atTime as number));

      if (effectiveEnd > effectiveStart) {
        const beatsInSegRange = (this.secondsToBeat(effectiveEnd) as number) - (this.secondsToBeat(effectiveStart) as number);
        const beatsToUse = Math.min(remainingBeats, beatsInSegRange);
        accumulatedBars += beatsToUse / seg.beatsPerBar;
        remainingBeats -= beatsToUse;
      }

      cursorTime = effectiveEnd;
      if (remainingBeats <= 0) break;
    }

    if (remainingBeats > 0) {
      const lastSeg = this.timeSigChanges[this.timeSigChanges.length - 1] as TimeSignatureChange;
      accumulatedBars += remainingBeats / lastSeg.beatsPerBar;
    }

    return bar(accumulatedBars);
  }

  setTempo(bpm: number, effectiveAt: SecondsTime): Result<void, AudioClockError> {
    if (bpm <= 0) {
      return err(
        new AudioClockErrorClass(
          'BPM must be greater than 0'
        )
      );
    }
    if (effectiveAt < this.startAudioTime) {
      return err(
        new AudioClockErrorClass(
          'Cannot set tempo earlier than start audio time'
        )
      );
    }
    if (effectiveAt < this.now()) {
      return err(
        new AudioClockErrorClass(
          'Cannot retroactively set tempo earlier than current audio time'
        )
      );
    }

    this.tempoChanges.push({ at: effectiveAt, value: bpm });
    return ok(undefined);
  }

  setTimeSignature(
    beatsPerBar: number,
    beatUnit: number,
    effectiveAt: SecondsTime
  ): Result<void, AudioClockError> {
    if (effectiveAt < this.startAudioTime) {
      return err(
        new AudioClockErrorClass(
          'Cannot set time signature earlier than start audio time'
        )
      );
    }
    if (effectiveAt < this.now()) {
      return err(
        new AudioClockErrorClass(
          'Cannot retroactively set time signature earlier than current audio time'
        )
      );
    }

    this.timeSigChanges.push({ at: effectiveAt, beatsPerBar, beatUnit });
    return ok(undefined);
  }

  probeNow(): ProbeReading {
    const audioTime = this.now();
    return {
      audioTime,
      beat: this.secondsToBeat(audioTime),
      bar: this.beatToBar(this.secondsToBeat(audioTime), audioTime),
      // measurement only, never used for scheduling
      wallClockReceivedAt: Date.now(),
    };
  }
}
