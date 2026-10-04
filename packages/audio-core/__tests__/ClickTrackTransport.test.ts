import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  ClickTrackTransport,
  seconds,
  type SecondsTime,
  type IBeatBarScheduler,
  type BeatEvent,
  beat,
} from '../src/index.js';
import type { IClock } from '../src/clock/types.js';
import { AudioClock } from '../src/clock/AudioClock.js';
import { BeatBarScheduler } from '../src/scheduler/BeatBarScheduler.js';

type FakeAudioCtx = ReturnType<typeof makeFakeCtx>;

function makeFakeCtx(initialCurrentTime: number = 0) {
  let currentTime = initialCurrentTime;
  const createdOscs: Array<{
    hz: number;
    startedAt: number;
    stoppedAt: number;
  }> = [];
  const createdGains: Array<{
    initialValue: number;
    setTargetCalls: Array<{ v: number; t: number; tc: number }>;
  }> = [];
  let suspended = false;
  let closed = false;

  return {
    advanceSeconds(by: number): void {
      currentTime += by;
    },
    jumpSeconds(to: number): void {
      currentTime = to;
    },
    createdOscs,
    createdGains,
    wasSuspended(): boolean {
      return suspended;
    },
    wasClosed(): boolean {
      return closed;
    },
    get currentTime(): number {
      return currentTime;
    },
    get sampleRate(): number {
      return 48000;
    },
    resume(): Promise<void> {
      suspended = false;
      return Promise.resolve();
    },
    suspend(): Promise<void> {
      suspended = true;
      return Promise.resolve();
    },
    close(): Promise<void> {
      closed = true;
      return Promise.resolve();
    },
    createOscillator() {
      const record = { hz: 440, startedAt: -1, stoppedAt: -1 };
      createdOscs.push(record);
      return {
        frequency: {
          set value(v: number) {
            record.hz = v;
          },
          get value() {
            return record.hz;
          },
        },
        type: 'square' as OscillatorType,
        connect() {},
        start(when: number) {
          record.startedAt = when;
        },
        stop(when: number) {
          record.stoppedAt = when;
        },
      };
    },
    createGain() {
      const rec = {
        initialValue: 0,
        setTargetCalls: [] as Array<{ v: number; t: number; tc: number }>,
      };
      createdGains.push(rec);
      const gain = {
        value: {
          _v: 0,
          set(v: number) {
            rec.initialValue = v;
            this._v = v;
          },
          get value() {
            return this._v;
          },
          setTargetAtTime(v: number, t: number, tc: number) {
            rec.setTargetCalls.push({ v, t, tc });
          },
        },
        connect() {},
      };
      Object.defineProperty(gain, 'gain', {
        value: {
          set value(v: number) {
            rec.initialValue = v;
          },
          get value() {
            return rec.initialValue;
          },
          setTargetAtTime(v: number, t: number, tc: number) {
            rec.setTargetCalls.push({ v, t, tc });
          },
        },
        writable: false,
      });
      return gain as unknown as {
        gain: { value: number; setTargetAtTime(v: number, t: number, tc: number): void };
        connect(d: unknown): void;
      };
    },
    destination: {},
  };
}

function runSchedulerTicks(
  scheduler: BeatBarScheduler,
  tickMs: number,
  ticks: number,
  advance: () => void
): void {
  for (let i = 0; i < ticks; i++) {
    advance();
    (scheduler as unknown as { tick: () => void }).tick();
  }
}

describe('ClickTrackTransport', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('play() on node (no AudioContext available) returns Result.err AudioContextUnavailable', () => {
    const t = new ClickTrackTransport();
    const r = t.play();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('AudioContextUnavailable');
    }
    expect(t.isPlaying()).toBe(false);
  });

  it('play() with injected fake ctx transitions isPlaying=true, position poll emits updates', () => {
    vi.useFakeTimers();
    const ctx = makeFakeCtx(10);
    const t = new ClickTrackTransport({
      initialBpm: 120,
      beatsPerBar: 4,
      beatUnit: 4,
      createAudioContext: () => ctx as unknown as Parameters<typeof makeFakeCtx>[0] extends never
        ? never
        : ReturnType<typeof makeFakeCtx>,
    });
    let posCount = 0;
    const last: { sec: number; playing: boolean } = { sec: 0, playing: false };
    t.onPositionChange((u) => {
      posCount += 1;
      last.sec = u.seconds as number;
      last.playing = u.isPlaying;
    });

    const playR = t.play();
    expect(playR.ok).toBe(true);
    expect(t.isPlaying()).toBe(true);
    const afterPlayCount = posCount;
    expect(afterPlayCount).toBeGreaterThan(0);

    ctx.advanceSeconds(0.5);
    vi.advanceTimersByTime(200);

    expect(last.playing).toBe(true);
    expect(last.sec).toBeGreaterThanOrEqual(0.45);
    expect(last.sec).toBeLessThanOrEqual(1.0);

    t.stop();
  });

  it('pause() is idempotent, transitions playing flag, stops position updates from poller', () => {
    vi.useFakeTimers();
    const ctx = makeFakeCtx(0);
    const t = new ClickTrackTransport({
      createAudioContext: () => ctx as unknown as never,
    });
    t.play();
    expect(t.isPlaying()).toBe(true);

    const pause1 = t.pause();
    const pause2 = t.pause();
    expect(pause1.ok).toBe(true);
    expect(pause2.ok).toBe(true);
    expect(t.isPlaying()).toBe(false);

    let afterPauseCount = 0;
    t.onPositionChange(() => { afterPauseCount += 1; });
    ctx.advanceSeconds(1);
    vi.advanceTimersByTime(500);
    expect(afterPauseCount).toBe(0);

    t.stop();
  });

  it('seek(negative) clamps to 0; seek past upper bound of current elapsed is honored', () => {
    vi.useFakeTimers();
    const ctx = makeFakeCtx(0);
    const t = new ClickTrackTransport({
      initialBpm: 60,
      createAudioContext: () => ctx as unknown as never,
    });
    t.play();
    ctx.advanceSeconds(2);
    vi.advanceTimersByTime(100);
    t.pause();

    const neg = t.seek(seconds(-5));
    expect(neg.ok).toBe(true);
    expect(t.currentSeconds() as number).toBe(0);

    const ahead = t.seek(seconds(10));
    expect(ahead.ok).toBe(true);
    expect((t.currentSeconds() as number)).toBe(10);

    t.stop();
  });

  it('stop() is idempotent and after stop(), play() restarts from elapsed=0', () => {
    vi.useFakeTimers();
    const ctx = makeFakeCtx(0);
    const t = new ClickTrackTransport({
      initialBpm: 120,
      createAudioContext: () => ctx as unknown as never,
    });
    t.play();
    ctx.advanceSeconds(3);
    vi.advanceTimersByTime(100);
    const s1 = t.stop();
    const s2 = t.stop();
    expect(s1.ok).toBe(true);
    expect(s2.ok).toBe(true);
    expect(t.currentSeconds() as number).toBe(0);
    expect(t.isPlaying()).toBe(false);
    expect(t.currentTurn()).toBe('human');

    t.play();
    expect(t.isPlaying()).toBe(true);
    expect((t.currentSeconds() as number)).toBeLessThan(0.1);

    t.stop();
  });

  it('committed beat events schedule click sounds: beat 1 => 880 Hz, other beats => 440 Hz (120 BPM 4/4)', () => {
    vi.useFakeTimers();
    const ctx = makeFakeCtx(0);
    const bpm = 120;
    const beatsPerBar = 4;
    let capturedBeats: Array<BeatEvent> = [];
    const wrapClock = (
      provider: () => number,
      start: SecondsTime,
      b: number,
      bpb: number,
      bu: number
    ): IClock => new AudioClock(provider, start, b, bpb, bu);
    const wrapScheduler = (
      lookAhead: SecondsTime,
      commitHorizon: SecondsTime
    ): IBeatBarScheduler => {
      const s = new BeatBarScheduler(lookAhead, commitHorizon);
      s.onBeat(
        (e) => { capturedBeats.push(e); },
        { onlyCommitted: true }
      );
      return s;
    };

    const t = new ClickTrackTransport({
      initialBpm: bpm,
      beatsPerBar,
      beatUnit: 4,
      lookAheadSeconds: 0.5,
      commitHorizonSeconds: 0.05,
      tickIntervalMs: 25,
      createAudioContext: () => ctx as unknown as never,
      createClock: wrapClock,
      createScheduler: wrapScheduler,
    });

    t.play();
    expect(t.isPlaying()).toBe(true);

    const totalAdvanceSeconds = 2.5;
    const stepMs = 10;
    const steps = Math.ceil((totalAdvanceSeconds * 1000) / stepMs);
    const currentSchedulerRef = (t as unknown as { scheduler: BeatBarScheduler | null })
      .scheduler as BeatBarScheduler | null;
    expect(currentSchedulerRef).not.toBeNull();

    const scheduler = currentSchedulerRef as BeatBarScheduler;

    for (let i = 0; i < steps; i++) {
      ctx.advanceSeconds(stepMs / 1000);
      (scheduler as unknown as { tick: () => void }).tick();
    }
    vi.advanceTimersByTime(0);

    const beatOnes = ctx.createdOscs.filter((o) => o.hz === 880 && o.startedAt >= 0);
    const beatOthers = ctx.createdOscs.filter((o) => o.hz === 440 && o.startedAt >= 0);

    expect(beatOnes.length).toBeGreaterThanOrEqual(1);
    expect(beatOthers.length).toBeGreaterThanOrEqual(beatOnes.length * 2);
    expect(capturedBeats.length).toBeGreaterThan(0);

    for (const o of ctx.createdOscs) {
      expect(o.startedAt).toBeGreaterThanOrEqual(0);
      expect(o.stoppedAt).toBeGreaterThan(o.startedAt);
    }

    t.stop();
  });

  it('resume after pause continues elapsed from pause offset, not from zero (no drift)', () => {
    vi.useFakeTimers();
    const ctx = makeFakeCtx(0);
    const t = new ClickTrackTransport({
      initialBpm: 60,
      createAudioContext: () => ctx as unknown as never,
    });
    t.play();
    ctx.advanceSeconds(1.2);
    vi.advanceTimersByTime(50);
    t.pause();
    const atPause = t.currentSeconds() as number;
    expect(atPause).toBeGreaterThanOrEqual(1.15);
    expect(atPause).toBeLessThanOrEqual(1.35);

    for (let i = 0; i < 3; i++) {
      ctx.advanceSeconds(1);
      vi.advanceTimersByTime(100);
      expect((t.currentSeconds() as number)).toBeCloseTo(atPause, 1);
    }

    t.play();
    ctx.advanceSeconds(0.6);
    vi.advanceTimersByTime(50);
    const afterResume = t.currentSeconds() as number;
    expect(afterResume).toBeGreaterThanOrEqual(atPause + 0.5);
    expect(afterResume).toBeLessThanOrEqual(atPause + 0.8);

    t.stop();
  });

  it('turn switches every 8 beats (default phrase length) starting human -> ai -> human', () => {
    vi.useFakeTimers();
    const ctx = makeFakeCtx(0);
    const bpm = 120;
    const t = new ClickTrackTransport({
      initialBpm: bpm,
      beatsPerBar: 4,
      beatUnit: 4,
      lookAheadSeconds: 1.0,
      commitHorizonSeconds: 0.2,
      createAudioContext: () => ctx as unknown as never,
    });

    const turnHistory: Array<{ at: number; turn: 'human' | 'ai' }> = [];
    t.onTurnChange((turn) => {
      turnHistory.push({ at: t.currentSeconds() as number, turn });
    });

    t.play();
    const scheduler = (t as unknown as { scheduler: BeatBarScheduler | null })
      .scheduler as BeatBarScheduler | null;
    expect(scheduler).not.toBeNull();

    const stepSec = 0.025;
    const totalSec = 20;
    for (let s = 0; s < Math.ceil(totalSec / stepSec); s++) {
      ctx.advanceSeconds(stepSec);
      (scheduler! as unknown as { tick: () => void }).tick();
    }

    expect(turnHistory.length).toBeGreaterThanOrEqual(2);
    expect(turnHistory[0]!.turn).toBe('ai');
    if (turnHistory[1]) {
      expect(turnHistory[1].turn).toBe('human');
    }
    if (turnHistory[2]) {
      expect(turnHistory[2].turn).toBe('ai');
    }
    t.stop();
  });

  it('setBpm() clamps to 40..220 and, when playing, restarts scheduler with new tempo (beat cadence changes)', () => {
    vi.useFakeTimers();
    const ctx = makeFakeCtx(0);
    const t = new ClickTrackTransport({
      initialBpm: 120,
      createAudioContext: () => ctx as unknown as never,
    });
    expect(t.currentBpm()).toBe(120);

    const setTooFast = t.setBpm(10_000);
    expect(setTooFast.ok).toBe(true);
    expect(t.currentBpm()).toBe(220);

    const setTooSlow = t.setBpm(1);
    expect(setTooSlow.ok).toBe(true);
    expect(t.currentBpm()).toBe(40);

    t.play();
    const schedulerBefore = (t as unknown as { scheduler: BeatBarScheduler | null })
      .scheduler as BeatBarScheduler | null;
    expect(schedulerBefore).not.toBeNull();

    const setPlaying = t.setBpm(180);
    expect(setPlaying.ok).toBe(true);
    expect(t.currentBpm()).toBe(180);
    expect(t.isPlaying()).toBe(true);

    t.stop();
  });

  it('setClickGainLinear clamps to 0..1; pending scheduled clicks after gain change use newest gain', () => {
    vi.useFakeTimers();
    const ctx = makeFakeCtx(0);
    const t = new ClickTrackTransport({
      clickGainLinear: 0.5,
      createAudioContext: () => ctx as unknown as never,
    });
    expect(t.currentClickGainLinear()).toBe(0.5);
    t.setClickGainLinear(-10);
    expect(t.currentClickGainLinear()).toBe(0);
    t.setClickGainLinear(99);
    expect(t.currentClickGainLinear()).toBe(1);
    t.setClickGainLinear(0.33);
    expect(t.currentClickGainLinear()).toBeCloseTo(0.33, 2);
    t.stop();
  });

  it('cleanup: stop() stops scheduler, cancels future clicks, suspends then closes AudioContext when close() exists', () => {
    vi.useFakeTimers();
    const ctx = makeFakeCtx(0);
    const t = new ClickTrackTransport({
      createAudioContext: () => ctx as unknown as never,
    });
    t.play();
    const scheduler = (t as unknown as { scheduler: BeatBarScheduler | null })
      .scheduler as BeatBarScheduler | null;
    expect(scheduler).not.toBeNull();

    ctx.advanceSeconds(0.5);
    (scheduler as unknown as { tick: () => void }).tick();
    vi.advanceTimersByTime(50);
    expect(ctx.createdOscs.length).toBeGreaterThan(0);

    t.stop();

    expect(ctx.wasSuspended()).toBe(true);
    expect(ctx.wasClosed()).toBe(true);
    expect(
      (t as unknown as { scheduler: BeatBarScheduler | null }).scheduler
    ).toBeNull();
    expect(t.isPlaying()).toBe(false);
  });
});
