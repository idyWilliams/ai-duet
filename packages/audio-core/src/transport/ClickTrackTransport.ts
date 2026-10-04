import type {
  ITransport,
  PositionUpdate,
  RemoveListener,
  TransportError,
  Turn,
} from './types.js';
import type { IBeatBarScheduler, BeatEvent } from '../scheduler/types.js';
import type { IClock } from '../clock/types.js';
import {
  seconds,
  err,
  ok,
  type SecondsTime,
  type Result,
} from '../types/index.js';
import { AudioClock } from '../clock/AudioClock.js';
import { BeatBarScheduler } from '../scheduler/BeatBarScheduler.js';

type AudioContextLike = {
  readonly currentTime: number;
  readonly sampleRate: number;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  close?(): Promise<void>;
  createOscillator(): OscillatorNodeLike;
  createGain(): GainNodeLike;
  readonly destination: { connect?: unknown };
};

type OscillatorNodeLike = {
  frequency: { value: number };
  type: OscillatorType;
  connect(dest: unknown): void;
  start(when: number): void;
  stop(when: number): void;
};

type GainNodeLike = {
  gain: { value: number; setTargetAtTime(v: number, t: number, tc: number): void };
  connect(dest: unknown): void;
};

export type ClickTrackTransportOpts = {
  initialBpm?: number;
  beatsPerBar?: number;
  beatUnit?: number;
  clickGainLinear?: number;
  lookAheadSeconds?: number;
  commitHorizonSeconds?: number;
  tickIntervalMs?: number;
  createAudioContext?: () => AudioContextLike | null;
  createClock?: (
    audioTimeProvider: () => number,
    startSeconds: SecondsTime,
    bpm: number,
    beatsPerBar: number,
    beatUnit: number
  ) => IClock;
  createScheduler?: (
    lookAhead: SecondsTime,
    commitHorizon: SecondsTime,
    tickIntervalMs: number
  ) => IBeatBarScheduler;
};

const DEFAULT_BPM = 100;
const DEFAULT_BEATS_PER_BAR = 4;
const DEFAULT_BEAT_UNIT = 4;
const DEFAULT_CLICK_GAIN = 0.25;
const DEFAULT_LOOK_AHEAD = 0.1;
const DEFAULT_COMMIT_HORIZON = 0.02;
const DEFAULT_TICK_MS = 25;
const POSITION_POLL_MS = 33;
const CLICK_BEAT1_HZ = 880;
const CLICK_OTHER_HZ = 440;
const CLICK_DURATION_SEC = 0.05;
const TURN_SWITCH_PHRASE_BEATS = 8;

type ResolvedOpts = {
  initialBpm: number;
  beatsPerBar: number;
  beatUnit: number;
  clickGainLinear: number;
  lookAheadSeconds: number;
  commitHorizonSeconds: number;
  tickIntervalMs: number;
  createAudioContext?: () => AudioContextLike | null;
  createClock: (
    audioTimeProvider: () => number,
    startSeconds: SecondsTime,
    bpm: number,
    beatsPerBar: number,
    beatUnit: number
  ) => IClock;
  createScheduler: (
    lookAhead: SecondsTime,
    commitHorizon: SecondsTime,
    tickIntervalMs: number
  ) => IBeatBarScheduler;
};

export class ClickTrackTransport implements ITransport {
  private readonly opts: ResolvedOpts;

  private readonly positionListeners: Array<(u: PositionUpdate) => void> = [];
  private readonly turnListeners: Array<(t: Turn) => void> = [];

  private _currentTurn: Turn = 'human';
  private _currentSeconds: SecondsTime = seconds(0);
  private _isPlaying: boolean = false;

  private audioContext: AudioContextLike | null = null;
  private clock: IClock | null = null;
  private scheduler: IBeatBarScheduler | null = null;

  private audioStartedAtCtxTime: number = 0;
  private pauseCumulativeElapsed: number = 0;

  private positionPollInterval: ReturnType<typeof setInterval> | null = null;
  private schedulerBeatUnsub: (() => void) | null = null;
  private lastTurnSwitchBeat: number = -1;
  private _clickGainLinear: number = DEFAULT_CLICK_GAIN;

  private pendingNodes: Array<{
    osc: OscillatorNodeLike;
    gain: GainNodeLike;
    stopAt: number;
  }> = [];

  constructor(opts: ClickTrackTransportOpts = {}) {
    const defaultCreateClock: ResolvedOpts['createClock'] = (
      provider,
      start,
      bpm,
      bpb,
      bu
    ) => new AudioClock(provider, start, bpm, bpb, bu);
    const defaultCreateScheduler: ResolvedOpts['createScheduler'] = (
      lookAhead,
      commitHorizon,
      _tickIntervalMs
    ) => new BeatBarScheduler(lookAhead, commitHorizon);

    const resolved: ResolvedOpts = {
      initialBpm: opts.initialBpm ?? DEFAULT_BPM,
      beatsPerBar: opts.beatsPerBar ?? DEFAULT_BEATS_PER_BAR,
      beatUnit: opts.beatUnit ?? DEFAULT_BEAT_UNIT,
      clickGainLinear: opts.clickGainLinear ?? DEFAULT_CLICK_GAIN,
      lookAheadSeconds: opts.lookAheadSeconds ?? DEFAULT_LOOK_AHEAD,
      commitHorizonSeconds: opts.commitHorizonSeconds ?? DEFAULT_COMMIT_HORIZON,
      tickIntervalMs: opts.tickIntervalMs ?? DEFAULT_TICK_MS,
      createClock: opts.createClock ?? defaultCreateClock,
      createScheduler: opts.createScheduler ?? defaultCreateScheduler,
    };
    if (opts.createAudioContext !== undefined) {
      (resolved as ResolvedOpts & { createAudioContext: ResolvedOpts['createAudioContext'] })
        .createAudioContext = opts.createAudioContext;
    }
    this.opts = resolved;
    this._clickGainLinear = this.opts.clickGainLinear;
  }

  play(): Result<void, TransportError> {
    if (this._isPlaying) return ok(undefined);

    const ctx = this.ensureAudioContext();
    if (ctx === null) {
      return err({
        kind: 'AudioContextUnavailable',
        message:
          'Web Audio is unavailable in this environment. Call from a user-gesture handler in the browser, or inject a createAudioContext factory in tests.',
      });
    }

    ctx
      .resume()
      .catch(() => undefined);

    const bpm = this.opts.initialBpm;
    const bpb = this.opts.beatsPerBar;
    const bu = this.opts.beatUnit;
    const clockStartCtxTime = ctx.currentTime;
    const clockStartElapsed = seconds(this.pauseCumulativeElapsed);

    this.audioStartedAtCtxTime = clockStartCtxTime - this.pauseCumulativeElapsed;

    const baseCtxBaseline = this.audioStartedAtCtxTime;
    const timeProvider = (): number => ctx.currentTime - baseCtxBaseline;
    this.clock = this.opts.createClock(
      timeProvider,
      clockStartElapsed,
      bpm,
      bpb,
      bu
    );

    this.scheduler = this.opts.createScheduler(
      seconds(this.opts.lookAheadSeconds),
      seconds(this.opts.commitHorizonSeconds),
      this.opts.tickIntervalMs
    );
    const startRes = this.scheduler.start(this.clock);
    if (startRes.ok === false) {
      return err({
        kind: 'AudioContextUnavailable',
        message: startRes.error.message,
      });
    }

    this.schedulerBeatUnsub = this.scheduler.onBeat(
      (ev) => this.handleCommittedBeat(ev),
      { onlyCommitted: true }
    );

    this._isPlaying = true;
    this.emitPosition();

    this.positionPollInterval = setInterval(() => {
      this.tickPollPosition();
    }, POSITION_POLL_MS);

    return ok(undefined);
  }

  pause(): Result<void, TransportError> {
    if (!this._isPlaying) return ok(undefined);

    this.stopPlayingInternals(/* rememberPauseOffset */ true);

    if (this.audioContext !== null) {
      this.audioContext
        .suspend()
        .catch(() => undefined);
    }

    this._isPlaying = false;
    this.emitPosition();
    return ok(undefined);
  }

  seek(target: SecondsTime): Result<void, TransportError> {
    let val = target as number;
    if (val < 0) val = 0;
    const wasPlaying = this._isPlaying;

    if (wasPlaying) {
      this._isPlaying = false;
      this.stopPlayingInternals(true);
    }

    this.pauseCumulativeElapsed = val;
    this._currentSeconds = seconds(val);

    const beatFloat = (this.opts.initialBpm / 60) * val;
    const beatIdxFloor = Math.floor(beatFloat);
    const turnPhraseCount = Math.floor(beatIdxFloor / TURN_SWITCH_PHRASE_BEATS);
    const newTurn: Turn = turnPhraseCount % 2 === 0 ? 'human' : 'ai';
    if (newTurn !== this._currentTurn) {
      this._currentTurn = newTurn;
      for (const l of this.turnListeners) l(newTurn);
    }
    this.lastTurnSwitchBeat = turnPhraseCount * TURN_SWITCH_PHRASE_BEATS - 1;

    if (wasPlaying) {
      const r = this.play();
      if (r.ok === false) return r;
    } else {
      this.emitPosition();
    }

    return ok(undefined);
  }

  stop(): Result<void, TransportError> {
    this.stopPlayingInternals(false);
    this.pauseCumulativeElapsed = 0;
    this._currentSeconds = seconds(0);
    this._currentTurn = 'human';
    this.lastTurnSwitchBeat = -1;

    const ctx = this.audioContext;
    if (ctx !== null) {
      ctx
        .suspend()
        .catch(() => undefined);
      if (typeof ctx.close === 'function') {
        ctx.close().catch(() => undefined);
      }
      this.audioContext = null;
    }

    this._isPlaying = false;
    this.emitPosition();
    return ok(undefined);
  }

  onPositionChange(cb: (u: PositionUpdate) => void): RemoveListener {
    this.positionListeners.push(cb);
    return () => {
      const idx = this.positionListeners.indexOf(cb);
      if (idx !== -1) this.positionListeners.splice(idx, 1);
    };
  }

  onTurnChange(cb: (t: Turn) => void): RemoveListener {
    this.turnListeners.push(cb);
    return () => {
      const idx = this.turnListeners.indexOf(cb);
      if (idx !== -1) this.turnListeners.splice(idx, 1);
    };
  }

  currentTurn(): Turn {
    return this._currentTurn;
  }

  currentSeconds(): SecondsTime {
    return this._currentSeconds;
  }

  isPlaying(): boolean {
    return this._isPlaying;
  }

  setBpm(next: number): Result<void, TransportError> {
    const clamped = Math.max(40, Math.min(220, Math.round(next)));
    this.opts.initialBpm = clamped;
    if (this._isPlaying) {
      return this.seek(this._currentSeconds);
    }
    return ok(undefined);
  }

  currentBpm(): number {
    return this.opts.initialBpm;
  }

  setClickGainLinear(next: number): void {
    this._clickGainLinear = Math.max(0, Math.min(1, next));
  }

  currentClickGainLinear(): number {
    return this._clickGainLinear;
  }

  startMockTicker(): void {}
  stopMockTicker(): void {}

  private ensureAudioContext(): AudioContextLike | null {
    if (this.audioContext !== null) return this.audioContext;
    if (typeof this.opts.createAudioContext === 'function') {
      this.audioContext = this.opts.createAudioContext();
      return this.audioContext;
    }
    if (typeof window === 'undefined') return null;
    const W = window as unknown as {
      AudioContext?: new () => AudioContextLike;
      webkitAudioContext?: new () => AudioContextLike;
    };
    const Ctor = W.AudioContext ?? W.webkitAudioContext;
    if (Ctor === undefined) return null;
    try {
      this.audioContext = new Ctor();
    } catch {
      this.audioContext = null;
    }
    return this.audioContext;
  }

  private stopPlayingInternals(rememberPauseOffset: boolean): void {
    if (this.positionPollInterval !== null) {
      clearInterval(this.positionPollInterval);
      this.positionPollInterval = null;
    }
    if (this.schedulerBeatUnsub !== null) {
      this.schedulerBeatUnsub();
      this.schedulerBeatUnsub = null;
    }
    if (this.scheduler !== null) {
      try {
        this.scheduler.cancelFuture(false);
      } catch {
        /* swallow; cleanup-only call */
      }
      this.scheduler.stop();
      this.scheduler = null;
    }

    this.stopAllPendingClicks();

    if (rememberPauseOffset && this.audioContext !== null) {
      const ctx = this.audioContext;
      this.pauseCumulativeElapsed = Math.max(
        0,
        ctx.currentTime - this.audioStartedAtCtxTime
      );
    }

    this.clock = null;
  }

  private handleCommittedBeat(ev: BeatEvent): void {
    const ctx = this.audioContext;
    if (ctx === null) return;

    const beatNum = ev.beat as unknown as number;
    const isBeatOne = beatNum % this.opts.beatsPerBar === 0;
    const hz = isBeatOne ? CLICK_BEAT1_HZ : CLICK_OTHER_HZ;

    const scheduledAtCtxTime =
      this.audioStartedAtCtxTime + (ev.scheduledAt as number);

    this.scheduleClick(ctx, hz, scheduledAtCtxTime);

    if (beatNum - this.lastTurnSwitchBeat >= TURN_SWITCH_PHRASE_BEATS) {
      this._currentTurn = this._currentTurn === 'human' ? 'ai' : 'human';
      this.lastTurnSwitchBeat = beatNum;
      for (const l of this.turnListeners) l(this._currentTurn);
    }
  }

  private scheduleClick(
    ctx: AudioContextLike,
    hz: number,
    whenCtxSeconds: number
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = hz;
    const g = Math.max(0, Math.min(1, this._clickGainLinear));
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(ctx.destination);

    const attack = 0.002;
    const hold = Math.max(0.001, CLICK_DURATION_SEC - attack - 0.003);
    const release = 0.003;
    const end = whenCtxSeconds + attack + hold + release;

    gain.gain.setTargetAtTime(g, whenCtxSeconds, attack / 3);
    gain.gain.setTargetAtTime(0, whenCtxSeconds + attack + hold, release / 3);

    osc.start(whenCtxSeconds);
    osc.stop(end + release * 2);

    this.pendingNodes.push({ osc, gain, stopAt: end + release * 2 });
    this.prunePendingNodes(ctx.currentTime);
  }

  private stopAllPendingClicks(): void {
    const ctx = this.audioContext;
    const safeNow = ctx !== null ? ctx.currentTime : Infinity;
    for (const n of this.pendingNodes) {
      try {
        n.gain.gain.setTargetAtTime(0, safeNow, 0.001);
      } catch {
        /* noop */
      }
      try {
        (n.osc.stop as (w?: number) => void)(safeNow + 0.01);
      } catch {
        /* noop; some impls throw on stopped nodes */
      }
    }
    this.pendingNodes = [];
  }

  private prunePendingNodes(nowCtx: number): void {
    if (this.pendingNodes.length < 200) return;
    this.pendingNodes = this.pendingNodes.filter((n) => n.stopAt > nowCtx - 2);
  }

  private tickPollPosition(): void {
    const ctx = this.audioContext;
    if (ctx === null) return;
    const elapsed = Math.max(0, ctx.currentTime - this.audioStartedAtCtxTime);
    this._currentSeconds = seconds(elapsed);
    this.emitPosition();
  }

  private emitPosition(): void {
    const u: PositionUpdate = {
      seconds: this._currentSeconds,
      isPlaying: this._isPlaying,
    };
    for (const l of this.positionListeners) l(u);
  }
}
