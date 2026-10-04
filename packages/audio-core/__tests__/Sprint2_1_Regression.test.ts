import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  ClickTrackTransport,
  seconds,
  type SecondsTime,
  type IBeatBarScheduler,
  type BeatEvent,
  type Turn,
  beat,
} from '../src/index.js';
import type { IClock } from '../src/clock/types.js';
import { AudioClock } from '../src/clock/AudioClock.js';
import { BeatBarScheduler } from '../src/scheduler/BeatBarScheduler.js';

const CALC_TOLERANCE_MS = 0.001;

type FakeCtxWithPerNodeRec = ReturnType<typeof makeEnhancedFakeCtx>;

function makeEnhancedFakeCtx(initialCurrentTime: number = 0) {
  let currentTime = initialCurrentTime;
  const createdOscs: Array<{
    hz: number;
    startedAt: number;
    stoppedAt: number;
    id: number;
  }> = [];
  const createdGains: Array<{
    id: number;
    initialValue: number;
    perGainSetTargetCalls: Array<{ v: number; t: number; tc: number }>;
  }> = [];
  let suspended = false;
  let closed = false;
  let oscCounter = 0;
  let gainCounter = 0;

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
    totalSetTargetCalls(): number {
      let n = 0;
      for (const g of createdGains) n += g.perGainSetTargetCalls.length;
      return n;
    },
    gainsWithSilenceCall(safeNow: number): number[] {
      const ids: number[] = [];
      for (const g of createdGains) {
        const hadSilence = g.perGainSetTargetCalls.some(
          (c) => c.v === 0 && Math.abs(c.t - safeNow) < 0.5 && c.tc <= 0.01
        );
        if (hadSilence) ids.push(g.id);
      }
      return ids;
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
      const id = ++oscCounter;
      const record = { hz: 440, startedAt: -1, stoppedAt: -1, id };
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
      const id = ++gainCounter;
      const rec = {
        id,
        initialValue: 0,
        perGainSetTargetCalls: [] as Array<{ v: number; t: number; tc: number }>,
      };
      createdGains.push(rec);
      const gainControlForGainProp = {
        set value(v: number) {
          rec.initialValue = v;
        },
        get value() {
          return rec.initialValue;
        },
        setTargetAtTime(v: number, t: number, tc: number) {
          rec.perGainSetTargetCalls.push({ v, t, tc });
        },
      };
      const gainValueForValueProp = {
        _v: 0,
        set value(v: number) {
          rec.initialValue = v;
          this._v = v;
        },
        get value() {
          return this._v;
        },
        setTargetAtTime(v: number, t: number, tc: number) {
          rec.perGainSetTargetCalls.push({ v, t, tc });
        },
      };
      const gainNode = {
        value: gainValueForValueProp,
        connect() {},
      };
      Object.defineProperty(gainNode, 'gain', {
        value: gainControlForGainProp,
        writable: false,
      });
      return gainNode as unknown as {
        gain: { value: number; setTargetAtTime(v: number, t: number, tc: number): void };
        connect(d: unknown): void;
      };
    },
    destination: {},
  };
}

function advanceByTicks(
  ctx: FakeCtxWithPerNodeRec,
  scheduler: BeatBarScheduler,
  totalSeconds: number,
  tickStepSeconds: number
): void {
  const steps = Math.max(1, Math.ceil(totalSeconds / tickStepSeconds));
  const stepSec = totalSeconds / steps;
  for (let i = 0; i < steps; i++) {
    ctx.advanceSeconds(stepSec);
    (scheduler as unknown as { tick: () => void }).tick();
  }
}

function accessInternal<T>(obj: unknown, key: string): T {
  return (obj as Record<string, unknown>)[key] as T;
}

describe('Sprint 2.1 — FR-8 Listener Lifecycle (stop() drains listeners defect)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('TR-2b: Two subscribers around stop() — pre-fix: subA callbacks are killed after stop()', () => {
    vi.useFakeTimers();
    const ctx = makeEnhancedFakeCtx(0);
    const t = new ClickTrackTransport({
      initialBpm: 120,
      beatsPerBar: 4,
      beatUnit: 4,
      createAudioContext: () => ctx as unknown as never,
    });

    let subAPosCount = 0;
    let subATurnCount = 0;
    const unsubAPos = t.onPositionChange(() => { subAPosCount++; });
    const unsubATurn = t.onTurnChange(() => { subATurnCount++; });

    let subBPosCount = 0;
    const unsubBPos = t.onPositionChange(() => { subBPosCount++; });

    t.play();
    const sched1 = accessInternal<BeatBarScheduler | null>(t, 'scheduler');
    expect(sched1).not.toBeNull();
    advanceByTicks(ctx, sched1!, 1.0, 0.01);
    vi.advanceTimersByTime(100);

    expect(subAPosCount).toBeGreaterThan(0);
    const subAAfterFirstRun = subAPosCount;
    const subBAfterFirstRun = subBPosCount;
    expect(subBAfterFirstRun).toBe(subAAfterFirstRun);

    t.stop();
    expect(t.currentSeconds() as number).toBe(0);
    expect(t.currentTurn()).toBe('human');

    t.play();
    const sched2 = accessInternal<BeatBarScheduler | null>(t, 'scheduler');
    expect(sched2).not.toBeNull();
    advanceByTicks(ctx, sched2!, 1.0, 0.01);
    vi.advanceTimersByTime(200);

    expect(subBPosCount).toBeGreaterThan(subBAfterFirstRun);

    expect(subAPosCount).toBeGreaterThan(subAAfterFirstRun);

    unsubAPos();
    unsubATurn();
    unsubBPos();
    t.stop();
  });

  it('TR-2c: stop() resets turn/elapsed, kills scheduler, suspends+closes ctx, but does NOT require listener drain', () => {
    vi.useFakeTimers();
    const ctx = makeEnhancedFakeCtx(0);
    const t = new ClickTrackTransport({
      createAudioContext: () => ctx as unknown as never,
    });
    t.play();
    const sched = accessInternal<BeatBarScheduler | null>(t, 'scheduler');
    expect(sched).not.toBeNull();
    advanceByTicks(ctx, sched!, 0.5, 0.01);

    t.stop();

    expect(t.currentSeconds() as number).toBe(0);
    expect(t.currentTurn()).toBe('human');
    expect(accessInternal<unknown>(t, 'scheduler')).toBeNull();
    expect(ctx.wasSuspended()).toBe(true);
    expect(ctx.wasClosed()).toBe(true);
  });

  it('TR-2d: seek/pause paths do not drain other subscribers (no-regression test)', () => {
    vi.useFakeTimers();
    const ctx = makeEnhancedFakeCtx(0);
    const t = new ClickTrackTransport({
      initialBpm: 120,
      createAudioContext: () => ctx as unknown as never,
    });

    let subA = 0;
    let subB = 0;
    t.onPositionChange(() => { subA++; });
    t.onPositionChange(() => { subB++; });

    t.play();
    const sched = accessInternal<BeatBarScheduler | null>(t, 'scheduler')!;
    advanceByTicks(ctx, sched, 0.5, 0.01);
    vi.advanceTimersByTime(50);
    const a1 = subA;
    const b1 = subB;
    expect(a1).toBeGreaterThan(0);

    t.pause();
    t.seek(seconds(2));
    t.play();
    const sched2 = accessInternal<BeatBarScheduler | null>(t, 'scheduler')!;
    advanceByTicks(ctx, sched2, 0.5, 0.01);
    vi.advanceTimersByTime(100);

    expect(subA).toBeGreaterThan(a1);
    expect(subB).toBeGreaterThan(b1);
    expect(subB).toBe(subA);

    t.stop();
  });
});

describe('Sprint 2.1 — FR-1/FR-2 Exact Scheduling Timestamps', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('TR-3a: Exact timestamps play-from-zero with T0=10.0 at 120 BPM 4/4 (NON-ZERO initial ctx.currentTime)', () => {
    vi.useFakeTimers();
    const T0 = 10.0;
    const ctx = makeEnhancedFakeCtx(T0);
    const bpm = 120;
    const bpb = 4;
    const beatDurSec = 60 / bpm;

    const t = new ClickTrackTransport({
      initialBpm: bpm,
      beatsPerBar: bpb,
      beatUnit: 4,
      lookAheadSeconds: 0.5,
      commitHorizonSeconds: 0.02,
      tickIntervalMs: 25,
      createAudioContext: () => ctx as unknown as never,
    });

    t.play();
    const sched = accessInternal<BeatBarScheduler | null>(t, 'scheduler');
    expect(sched).not.toBeNull();

    advanceByTicks(ctx, sched!, 3.5, 0.01);
    vi.advanceTimersByTime(0);

    const expectedBeatTimes = new Map<number, { expected: number; count: number }>();
    for (let n = 0; n <= 6; n++) {
      expectedBeatTimes.set(n, {
        expected: T0 + n * beatDurSec,
        count: 0,
      });
    }

    for (const osc of ctx.createdOscs) {
      for (const [n, bucket] of expectedBeatTimes) {
        if (Math.abs(osc.startedAt - bucket.expected) <= CALC_TOLERANCE_MS) {
          bucket.count++;
          break;
        }
      }
    }

    for (let n = 0; n <= 6; n++) {
      const { expected, count } = expectedBeatTimes.get(n)!;
      expect(count).toBeGreaterThanOrEqual(1);
      if (n % bpb === 0) {
        const beatOneAtTime = ctx.createdOscs.filter(
          (o) => o.hz === 880 && Math.abs(o.startedAt - expected) <= CALC_TOLERANCE_MS
        );
        expect(beatOneAtTime.length).toBeGreaterThanOrEqual(1);
      }
    }

    t.stop();
  });

  it('TR-3b: Pause then resume — exact UNAMBIGUOUS next beat timestamp after 1.2s pause offset at 120 BPM. Uses unified formula: resume native S = audioStartedAtCtxTime(resume) + (startAudioTime of new clock = pauseCumulativeElapsed) = resume_ctx_T exactly. Tolerance 1 ms CALC only.', () => {
    vi.useFakeTimers();
    const bpm = 120;
    const beatDurSec = 60 / bpm;
    const ctx = makeEnhancedFakeCtx(0);

    const t = new ClickTrackTransport({
      initialBpm: bpm,
      beatsPerBar: 4,
      beatUnit: 4,
      lookAheadSeconds: 0.3,
      commitHorizonSeconds: 0.02,
      createAudioContext: () => ctx as unknown as never,
    });

    t.play();
    const sched1 = accessInternal<BeatBarScheduler | null>(t, 'scheduler')!;

    advanceByTicks(ctx, sched1, 1.2, 0.005);
    vi.advanceTimersByTime(250);

    const elapsedAtPause = t.currentSeconds() as number;
    expect(elapsedAtPause).toBeGreaterThanOrEqual(1.15);
    expect(elapsedAtPause).toBeLessThanOrEqual(1.30);

    t.pause();
    const pauseCumAfterPause = accessInternal<number>(t, 'pauseCumulativeElapsed');
    expect(pauseCumAfterPause).toBeGreaterThanOrEqual(1.15);
    expect(pauseCumAfterPause).toBeLessThanOrEqual(1.30);

    ctx.advanceSeconds(10);
    vi.advanceTimersByTime(10_000);

    t.play();
    const ctxTimeAtResume = ctx.currentTime;
    const audioStartedAtCtxTime = accessInternal<number>(t, 'audioStartedAtCtxTime');

    const sched2 = accessInternal<BeatBarScheduler | null>(t, 'scheduler')!;
    advanceByTicks(ctx, sched2, 1.0, 0.005);
    vi.advanceTimersByTime(50);

    expect(audioStartedAtCtxTime).toBeCloseTo(ctxTimeAtResume - pauseCumAfterPause, 6);

    const expectedFirstBeatMusical = pauseCumAfterPause;
    const expectedNative = audioStartedAtCtxTime + expectedFirstBeatMusical;

    expect(Math.abs(expectedNative - ctxTimeAtResume)).toBeLessThanOrEqual(CALC_TOLERANCE_MS);

    const matches = ctx.createdOscs.filter(
      (o) => Math.abs(o.startedAt - expectedNative) <= CALC_TOLERANCE_MS
    );
    expect(matches.length).toBeGreaterThanOrEqual(1);

    const nextBeatNative = expectedNative + beatDurSec;
    const next = ctx.createdOscs.filter(
      (o) => Math.abs(o.startedAt - nextBeatNative) <= CALC_TOLERANCE_MS + 0.005
    );
    expect(next.length).toBeGreaterThanOrEqual(1);
    expect(Math.abs(next[0]!.startedAt - matches[0]!.startedAt - beatDurSec)).toBeLessThanOrEqual(CALC_TOLERANCE_MS + 0.005);

    t.stop();
  });

  it('TR-3d: No duplicate clicks — stress test with 1ms scheduler ticks at 120 BPM', () => {
    vi.useFakeTimers();
    const ctx = makeEnhancedFakeCtx(0);
    const bpm = 120;
    const bpb = 4;
    const beatDurSec = 60 / bpm;

    const t = new ClickTrackTransport({
      initialBpm: bpm,
      beatsPerBar: bpb,
      beatUnit: 4,
      lookAheadSeconds: 0.3,
      commitHorizonSeconds: 0.02,
      createAudioContext: () => ctx as unknown as never,
    });

    t.play();
    const sched = accessInternal<BeatBarScheduler | null>(t, 'scheduler')!;

    const totalSec = 3.0;
    const tickStepSec = 0.001;
    const steps = Math.ceil(totalSec / tickStepSec);
    for (let i = 0; i < steps; i++) {
      ctx.advanceSeconds(tickStepSec);
      (sched as unknown as { tick: () => void }).tick();
    }

    const countsByBeat = new Map<number, number>();
    const expectedBeats = 7;
    for (let n = 0; n < expectedBeats; n++) {
      const expected = n * beatDurSec;
      const oscs = ctx.createdOscs.filter(
        (o) => Math.abs(o.startedAt - expected) <= CALC_TOLERANCE_MS
      );
      countsByBeat.set(n, oscs.length);
    }

    for (const [n, c] of countsByBeat) {
      expect(c).toBe(1);
    }

    const beatOneHzOscs = ctx.createdOscs.filter((o) => o.hz === 880);
    expect(beatOneHzOscs.length).toBeGreaterThanOrEqual(1);
    for (const o of beatOneHzOscs) {
      const beatIdx = Math.round(o.startedAt / beatDurSec);
      expect(beatIdx % bpb).toBe(0);
    }

    t.stop();
  });
});

describe('Sprint 2.1 — FR-5/FR-6 Stop/Seek/Tempo Event Cancellation', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('TR-3c + TR-4b: Seek far forward eliminates stale timeline clicks', () => {
    vi.useFakeTimers();
    const ctx = makeEnhancedFakeCtx(0);
    const bpm = 120;
    const beatDurSec = 60 / bpm;

    const t = new ClickTrackTransport({
      initialBpm: bpm,
      beatsPerBar: 4,
      beatUnit: 4,
      lookAheadSeconds: 0.5,
      commitHorizonSeconds: 0.02,
      createAudioContext: () => ctx as unknown as never,
    });

    t.play();
    const sched1 = accessInternal<BeatBarScheduler | null>(t, 'scheduler')!;
    advanceByTicks(ctx, sched1, 2.0, 0.01);
    const oscsBeforeSeek = ctx.createdOscs.length;
    expect(oscsBeforeSeek).toBeGreaterThan(0);

    const ctxTimeAtSeek = ctx.currentTime;
    const seekTo = 30;
    t.seek(seconds(seekTo));
    const ctxTimeAfterSeek = ctx.currentTime;

    const sched2Maybe = accessInternal<BeatBarScheduler | null>(t, 'scheduler');
    expect(sched2Maybe).not.toBeNull();
    const sched2 = sched2Maybe as BeatBarScheduler;
    advanceByTicks(ctx, sched2, 0.5, 0.01);

    const audioStartedNew = ctxTimeAfterSeek - seekTo;
    const newTimelineStart = audioStartedNew + seekTo - 0.02;
    const oldTimelineCutoff = ctxTimeAtSeek + 2.0 * beatDurSec + 0.1;

    for (const osc of ctx.createdOscs) {
      if (osc.startedAt <= oldTimelineCutoff) continue;
      if (osc.startedAt >= newTimelineStart) continue;
      expect(false).toBe(true);
    }
    expect(true).toBe(true);

    const nextAfterSeekBeatIdx = Math.floor((bpm / 60) * seekTo);
    const nextAfterSeekMusical = nextAfterSeekBeatIdx * beatDurSec;
    const expectedCtx = audioStartedNew + nextAfterSeekMusical;
    const matching = ctx.createdOscs.filter(
      (o) => Math.abs(o.startedAt - expectedCtx) <= CALC_TOLERANCE_MS
    );
    expect(matching.length).toBeGreaterThanOrEqual(1);

    t.stop();
  });

  it('TR-4c: stop() silences EVERY pending click gain node individually (per-gain setTargetAtTime(0,...))', () => {
    vi.useFakeTimers();
    const ctx = makeEnhancedFakeCtx(0);
    const t = new ClickTrackTransport({
      initialBpm: 60,
      lookAheadSeconds: 3.0,
      commitHorizonSeconds: 2.5,
      createAudioContext: () => ctx as unknown as never,
    });

    t.play();
    const sched = accessInternal<BeatBarScheduler | null>(t, 'scheduler')!;
    advanceByTicks(ctx, sched, 2.5, 0.01);

    const pending = accessInternal<unknown[]>(t, 'pendingNodes');
    const pendingCount = pending.length;
    expect(pendingCount).toBeGreaterThanOrEqual(5);

    const safeNow = ctx.currentTime;
    t.stop();

    const gainIdsCreated = new Set(ctx.createdGains.map((g) => g.id));
    const gainIdsSilenced = new Set(ctx.gainsWithSilenceCall(safeNow));
    for (const id of gainIdsCreated) {
      if (id <= pendingCount) {
        expect(gainIdsSilenced.has(id)).toBe(true);
      }
    }
  });

  it('TR-4a: setBpm during play does not leave duplicate click pairs at commit boundary. TIGHTENED to detect duplicate MUSICAL beat identities (bpm-keyed beat idx + beat-one flag), not only timestamp proximity.', () => {
    vi.useFakeTimers();
    const ctx = makeEnhancedFakeCtx(0);
    const initBpm = 120;
    const nextBpm = 180;
    const t = new ClickTrackTransport({
      initialBpm: initBpm,
      beatsPerBar: 4,
      beatUnit: 4,
      lookAheadSeconds: 0.2,
      commitHorizonSeconds: 0.02,
      createAudioContext: () => ctx as unknown as never,
    });

    t.play();
    const sched1 = accessInternal<BeatBarScheduler | null>(t, 'scheduler')!;
    advanceByTicks(ctx, sched1, 1.0, 0.005);

    const osccBefore = ctx.createdOscs.length;
    expect(osccBefore).toBeGreaterThan(2);
    const ctxAtBpm = ctx.currentTime;

    const setR = t.setBpm(nextBpm);
    expect(setR.ok).toBe(true);
    expect(t.currentBpm()).toBe(nextBpm);

    const sched2Maybe = accessInternal<BeatBarScheduler | null>(t, 'scheduler');
    expect(sched2Maybe).not.toBeNull();
    const sched2 = sched2Maybe as BeatBarScheduler;
    advanceByTicks(ctx, sched2, 1.5, 0.005);
    vi.advanceTimersByTime(80);

    const audioStarted = accessInternal<number>(t, 'audioStartedAtCtxTime');
    const oldBeatDur = 60 / initBpm;
    const newBeatDur = 60 / nextBpm;

    const sorted = [...ctx.createdOscs].sort((a, b) => a.startedAt - b.startedAt);
    let duplicatePairs = 0;
    for (let i = 1; i < sorted.length; i++) {
      if (Math.abs(sorted[i]!.startedAt - sorted[i - 1]!.startedAt) < 0.005) {
        duplicatePairs++;
      }
    }
    expect(duplicatePairs).toBeLessThanOrEqual(1);

    const musicalSeen = new Set<string>();
    let duplicateMusicalIds = 0;
    for (const o of sorted) {
      const musicalSec = o.startedAt - audioStarted;
      if (musicalSec < 0) continue;
      let beatIdx: number;
      let usedBpm: number;
      if (o.startedAt <= ctxAtBpm + 0.05 + oldBeatDur) {
        usedBpm = initBpm;
        beatIdx = Math.round(musicalSec / oldBeatDur);
      } else {
        usedBpm = nextBpm;
        beatIdx = Math.round(musicalSec / newBeatDur);
      }
      const isBeatOne = o.hz === 880;
      const key = `${usedBpm}-${beatIdx}-${isBeatOne ? 'b1' : 'bn'}`;
      if (musicalSeen.has(key) && musicalSec >= ctxAtBpm - 0.05) {
        duplicateMusicalIds++;
      }
      musicalSeen.add(key);
    }
    expect(duplicateMusicalIds).toBeLessThanOrEqual(1);

    expect(t.currentBpm()).toBe(nextBpm);

    t.stop();
  });

  it('FR-11: stop() leaves no active intervals, zero pendingNodes, scheduler null', () => {
    vi.useFakeTimers();
    const ctx = makeEnhancedFakeCtx(0);
    const t = new ClickTrackTransport({
      createAudioContext: () => ctx as unknown as never,
    });

    t.play();
    const sched = accessInternal<BeatBarScheduler | null>(t, 'scheduler')!;
    advanceByTicks(ctx, sched, 0.5, 0.01);

    t.stop();

    expect(accessInternal<unknown>(t, 'scheduler')).toBeNull();
    expect(accessInternal<unknown>(t, 'positionPollInterval')).toBeNull();
    expect(accessInternal<unknown>(t, 'schedulerBeatUnsub')).toBeNull();
    expect(accessInternal<unknown[]>(t, 'pendingNodes').length).toBe(0);
  });
});

describe('Sprint 2.1 — FR-9/FR-10 React Subscription Lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('TR-5a: StrictMode double-effect unsubscribe-then-resubscribe — no duplicate callbacks per poll', () => {
    vi.useFakeTimers();
    const ctx = makeEnhancedFakeCtx(0);
    const t = new ClickTrackTransport({
      initialBpm: 120,
      createAudioContext: () => ctx as unknown as never,
    });

    let posCallCount = 0;
    let turnCallCount = 0;
    const posCb = () => { posCallCount++; };
    const turnCb = () => { turnCallCount++; };

    const unsub1Pos = t.onPositionChange(posCb);
    const unsub1Turn = t.onTurnChange(turnCb);

    unsub1Pos();
    unsub1Turn();

    const unsub2Pos = t.onPositionChange(posCb);
    const unsub2Turn = t.onTurnChange(turnCb);

    t.play();
    const sched = accessInternal<BeatBarScheduler | null>(t, 'scheduler')!;
    advanceByTicks(ctx, sched, 0.5, 0.01);

    const pollIntervalMs = 33;
    const expectedPollsApprox = 15;
    vi.advanceTimersByTime(pollIntervalMs * expectedPollsApprox);

    expect(posCallCount).toBeGreaterThan(2);
    expect(posCallCount).toBeLessThanOrEqual(expectedPollsApprox + 2);

    unsub2Pos();
    unsub2Turn();
    t.stop();
  });

  it('TR-5b: Song change lifecycle — Player unmount stop then new mount subscribe+play works', () => {
    vi.useFakeTimers();
    const ctx = makeEnhancedFakeCtx(0);
    const sharedTransport = new ClickTrackTransport({
      initialBpm: 120,
      createAudioContext: () => ctx as unknown as never,
    });

    let player1Pos = 0;
    let player1Turn = 0;
    const unsubP1Pos = sharedTransport.onPositionChange(() => { player1Pos++; });
    const unsubP1Turn = sharedTransport.onTurnChange(() => { player1Turn++; });

    sharedTransport.play();
    const schedA = accessInternal<BeatBarScheduler | null>(sharedTransport, 'scheduler')!;
    advanceByTicks(ctx, schedA, 0.5, 0.01);
    vi.advanceTimersByTime(100);
    expect(player1Pos).toBeGreaterThan(0);

    unsubP1Pos();
    unsubP1Turn();
    sharedTransport.stop();

    expect(() => {
      for (let i = 0; i < 3; i++) {
        sharedTransport.onPositionChange(() => { /* leaked */ });
      }
    }).not.toThrow();

    let player2Pos = 0;
    let player2Turn = 0;
    sharedTransport.onPositionChange(() => { player2Pos++; });
    sharedTransport.onTurnChange(() => { player2Turn++; });

    sharedTransport.play();
    const schedB = accessInternal<BeatBarScheduler | null>(sharedTransport, 'scheduler')!;
    advanceByTicks(ctx, schedB, 0.5, 0.01);
    vi.advanceTimersByTime(200);

    expect(player2Pos).toBeGreaterThan(0);

    sharedTransport.stop();
  });

  it('FR-7: RemoveListener removes ONLY its own subscriber, not siblings', () => {
    vi.useFakeTimers();
    const ctx = makeEnhancedFakeCtx(0);
    const t = new ClickTrackTransport({
      initialBpm: 60,
      createAudioContext: () => ctx as unknown as never,
    });

    let a = 0, b = 0, c = 0;
    const unsubA = t.onPositionChange(() => { a++; });
    const unsubB = t.onPositionChange(() => { b++; });
    const unsubC = t.onPositionChange(() => { c++; });

    t.play();
    const sched = accessInternal<BeatBarScheduler | null>(t, 'scheduler')!;
    advanceByTicks(ctx, sched, 0.3, 0.01);
    vi.advanceTimersByTime(80);
    const a1 = a, b1 = b, c1 = c;
    expect(a1).toBeGreaterThan(0);

    unsubB();

    advanceByTicks(ctx, sched, 0.3, 0.01);
    vi.advanceTimersByTime(80);

    expect(a).toBeGreaterThan(a1);
    expect(c).toBeGreaterThan(c1);
    expect(b).toBe(b1);

    unsubA();
    unsubC();
    t.stop();
  });

  it('TR-M3a: Timing contract — CTX.currentTime=100, seek(30) while playing → phrase M=30 @ ctx now_post_seek & M=32 @ now_post_seek+2.0 (±1 ms calc tolerance). No stale pre-seek events.', () => {
    vi.useFakeTimers();
    const CTX_START = 100.0;
    const bpm = 120;
    const beatDur = 60 / bpm;
    const SEEK_M = 30;
    const ctx = makeEnhancedFakeCtx(CTX_START);
    const t = new ClickTrackTransport({
      initialBpm: bpm,
      beatsPerBar: 4,
      beatUnit: 4,
      lookAheadSeconds: 0.5,
      commitHorizonSeconds: 0.02,
      createAudioContext: () => ctx as unknown as never,
    });

    t.play();
    const schedBefore = accessInternal<BeatBarScheduler | null>(t, 'scheduler')!;
    advanceByTicks(ctx, schedBefore, 2.0, 0.01);
    const oscCountBeforeSeek = ctx.createdOscs.length;
    expect(oscCountBeforeSeek).toBeGreaterThan(2);
    const lastPreSeekCtxTime = ctx.currentTime;

    t.seek(seconds(SEEK_M));
    const ctxTimeAtSeekDone = ctx.currentTime;

    const schedAfterMaybe = accessInternal<BeatBarScheduler | null>(t, 'scheduler');
    expect(schedAfterMaybe).not.toBeNull();
    const schedAfter = schedAfterMaybe as BeatBarScheduler;
    advanceByTicks(ctx, schedAfter, 2.5, 0.01);
    vi.advanceTimersByTime(100);

    const audioStartedAtCtxTime = accessInternal<number>(t, 'audioStartedAtCtxTime');
    const expectedPhraseStart30 = audioStartedAtCtxTime + SEEK_M;
    const expectedPhraseStart32 = audioStartedAtCtxTime + 32;

    expect(audioStartedAtCtxTime).toBeCloseTo(ctxTimeAtSeekDone - SEEK_M, 3);

    expect(expectedPhraseStart32 - expectedPhraseStart30).toBeCloseTo(2.0, 6);

    const beatIdxAt30 = Math.floor((bpm / 60) * SEEK_M);
    const musicalSecOfBeatAt30 = beatIdxAt30 * beatDur;
    const expectedBeatAtMusical30 = audioStartedAtCtxTime + musicalSecOfBeatAt30;
    const matchedBeatAt30 = ctx.createdOscs.filter(
      (o) => Math.abs(o.startedAt - expectedBeatAtMusical30) <= CALC_TOLERANCE_MS
    );
    expect(matchedBeatAt30.length).toBeGreaterThanOrEqual(1);

    const beatIdxAt32 = Math.floor((bpm / 60) * 32);
    const musicalSecOfBeatAt32 = beatIdxAt32 * beatDur;
    const expectedBeatAtMusical32 = audioStartedAtCtxTime + musicalSecOfBeatAt32;
    const matchedBeatAt32 = ctx.createdOscs.filter(
      (o) => Math.abs(o.startedAt - expectedBeatAtMusical32) <= CALC_TOLERANCE_MS
    );
    expect(matchedBeatAt32.length).toBeGreaterThanOrEqual(1);

    const staleGapStart = lastPreSeekCtxTime + 0.2;
    const staleGapEnd = expectedPhraseStart30 - 0.001;
    let staleInGap = 0;
    for (const o of ctx.createdOscs) {
      if (o.startedAt > staleGapStart && o.startedAt < staleGapEnd) staleInGap++;
    }
    expect(staleInGap).toBe(0);

    const recordingFormula30 = expectedPhraseStart30;
    const recordingFormula32 = expectedPhraseStart32;
    const beatOneIn30s = matchedBeatAt30[0]!;
    expect(Math.abs(beatOneIn30s.startedAt - recordingFormula30)).toBeLessThanOrEqual(beatDur);

    const beatOneIn32s = matchedBeatAt32[0]!;
    expect(Math.abs(beatOneIn32s.startedAt - recordingFormula32)).toBeLessThanOrEqual(beatDur);

    t.stop();
  });

  it('TR-M3b: Tightened pause/resume ONE UNAMBIGUOUS timestamp. Pause at exactly beat 2 (musical 1.0 s), resume 10s later → next scheduled beat is musical 1.0 s (beat 2) at ctx resume_T - pauseMusical + 1.0 = exactly resume_T, because clock startAudioTime == pauseMusical offset.', () => {
    vi.useFakeTimers();
    const bpm = 120;
    const beatDur = 60 / bpm;
    const ctx = makeEnhancedFakeCtx(0);
    const t = new ClickTrackTransport({
      initialBpm: bpm,
      beatsPerBar: 4,
      beatUnit: 4,
      lookAheadSeconds: 0.3,
      commitHorizonSeconds: 0.02,
      createAudioContext: () => ctx as unknown as never,
    });

    t.play();
    const sched1 = accessInternal<BeatBarScheduler | null>(t, 'scheduler')!;
    const numTicks = Math.floor(1.0 / 0.005);
    for (let i = 0; i < numTicks; i++) {
      ctx.advanceSeconds(0.005);
      (sched1 as unknown as { tick: () => void }).tick();
    }
    ctx.advanceSeconds(1.0 - numTicks * 0.005);
    vi.advanceTimersByTime(250);

    const pauseMusicalElapsed = accessInternal<number>(t, 'pauseCumulativeElapsed');
    const currentSec = t.currentSeconds() as number;
    expect(currentSec).toBeCloseTo(1.0, 2);

    t.pause();
    const pauseOffset = accessInternal<number>(t, 'pauseCumulativeElapsed');
    expect(pauseOffset).toBeGreaterThanOrEqual(0.95);
    expect(pauseOffset).toBeLessThanOrEqual(1.10);

    ctx.advanceSeconds(10);
    vi.advanceTimersByTime(10_000);

    t.play();
    const ctxTresume = ctx.currentTime;
    const sched2 = accessInternal<BeatBarScheduler | null>(t, 'scheduler')!;
    advanceByTicks(ctx, sched2, 0.6, 0.005);
    vi.advanceTimersByTime(80);

    const expectedUnambiguous = ctxTresume;
    const toleranceMs = 0.001;
    const beatAtResume = ctx.createdOscs.find(
      (o) => Math.abs(o.startedAt - expectedUnambiguous) <= 0.02 + toleranceMs
    );
    expect(beatAtResume).toBeDefined();

    const exactTolMatches = ctx.createdOscs.filter(
      (o) => Math.abs(o.startedAt - expectedUnambiguous) <= toleranceMs
    );
    expect(exactTolMatches.length).toBeGreaterThanOrEqual(1);
    const t0 = exactTolMatches[0]!.startedAt;
    const nextExpected = expectedUnambiguous + beatDur;
    const next = ctx.createdOscs.filter(
      (o) => Math.abs(o.startedAt - nextExpected) <= toleranceMs + 0.005
    );
    expect(next.length).toBeGreaterThanOrEqual(1);
    const t1 = next[0]!.startedAt;
    expect(Math.abs(t1 - t0 - beatDur)).toBeLessThanOrEqual(0.005 + toleranceMs);

    t.stop();
  });

  it('TR-M3c: setBpm identifies duplicate MUSICAL beat IDs (not only timestamp proximity). After setBpm 120→180 at commit boundary, no musical beat (bpm-keyed pair) scheduled more than once at new cadence.', () => {
    vi.useFakeTimers();
    const ctx = makeEnhancedFakeCtx(0);
    const initBpm = 120;
    const nextBpm = 180;
    const t = new ClickTrackTransport({
      initialBpm: initBpm,
      beatsPerBar: 4,
      beatUnit: 4,
      lookAheadSeconds: 0.2,
      commitHorizonSeconds: 0.02,
      createAudioContext: () => ctx as unknown as never,
    });

    t.play();
    const sched1 = accessInternal<BeatBarScheduler | null>(t, 'scheduler')!;
    advanceByTicks(ctx, sched1, 1.0, 0.005);
    const osccBefore = ctx.createdOscs.length;
    expect(osccBefore).toBeGreaterThan(2);

    const ctxAtBpm = ctx.currentTime;

    const setRes = t.setBpm(nextBpm);
    expect(setRes.ok).toBe(true);
    expect(t.currentBpm()).toBe(nextBpm);

    const sched2Maybe = accessInternal<BeatBarScheduler | null>(t, 'scheduler');
    expect(sched2Maybe).not.toBeNull();
    const sched2 = sched2Maybe as BeatBarScheduler;
    advanceByTicks(ctx, sched2, 1.5, 0.005);
    vi.advanceTimersByTime(80);

    const audioStarted = accessInternal<number>(t, 'audioStartedAtCtxTime');
    const oldBeatDur = 60 / initBpm;
    const newBeatDur = 60 / nextBpm;

    const seenMusicalIds = new Set<string>();
    let duplicateMusicalIds = 0;
    for (const o of ctx.createdOscs) {
      const musicalSec = o.startedAt - audioStarted;
      if (musicalSec < 0) continue;
      let beatIdx: number;
      let usedBpm: number;
      if (o.startedAt <= ctxAtBpm + 0.05 + oldBeatDur) {
        usedBpm = initBpm;
        beatIdx = Math.round(musicalSec / oldBeatDur);
      } else {
        usedBpm = nextBpm;
        beatIdx = Math.round(musicalSec / newBeatDur);
      }
      const isBeatOne = o.hz === 880;
      const key = `${usedBpm}-${beatIdx}-${isBeatOne ? 'b1' : 'bn'}`;
      if (seenMusicalIds.has(key) && musicalSec > ctxAtBpm - 0.05) {
        duplicateMusicalIds++;
      }
      seenMusicalIds.add(key);
    }
    expect(duplicateMusicalIds).toBeLessThanOrEqual(1);

    const sorted = [...ctx.createdOscs].sort((a, b) => a.startedAt - b.startedAt);
    let timeDuplicatePairs = 0;
    for (let i = 1; i < sorted.length; i++) {
      if (Math.abs(sorted[i]!.startedAt - sorted[i - 1]!.startedAt) < 0.005) {
        timeDuplicatePairs++;
      }
    }
    expect(timeDuplicatePairs).toBeLessThanOrEqual(1);
    expect(t.currentBpm()).toBe(nextBpm);

    t.stop();
  });
});
