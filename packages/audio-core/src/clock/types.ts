import type { SecondsTime, BeatTime, BarTime, AudioClockError, Result } from '../types/index.js';

export interface ProbeReading {
  audioTime: SecondsTime;
  beat: BeatTime;
  bar: BarTime;
  // measurement only, never used for scheduling
  wallClockReceivedAt: number;
}

export type TempoChange = {
  at: SecondsTime;
  value: number;
};

export type TimeSignatureChange = {
  at: SecondsTime;
  beatsPerBar: number;
  beatUnit: number;
};

export interface IClock {
  now(): SecondsTime;
  currentBeat(): BeatTime;
  currentBar(): BarTime;
  beatToSeconds(b: BeatTime): SecondsTime;
  secondsToBeat(s: SecondsTime): BeatTime;
  setTempo(bpm: number, effectiveAt: SecondsTime): Result<void, AudioClockError>;
  setTimeSignature(
    beatsPerBar: number,
    beatUnit: number,
    effectiveAt: SecondsTime
  ): Result<void, AudioClockError>;
  probeNow(): ProbeReading;
}
