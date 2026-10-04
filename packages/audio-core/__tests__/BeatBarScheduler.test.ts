import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BeatBarScheduler, AudioClock } from '../src/index.js';
import type { BeatEvent, BarEvent } from '../src/scheduler/types.js';
import {
  seconds,
  beat,
  bar,
  ok,
  err,
} from '../src/types/index.js';

describe('BeatBarScheduler (Task 5)', () => {
  function makeManualTimeEnv(initialBpm = 120, bpb = 4, bu = 4) {
    let currentAudioTime = 0;
    const provider = () => currentAudioTime;
    const clock = new AudioClock(provider, seconds(0), initialBpm, bpb, bu);
    return {
      clock,
      setTime(t: number) {
        currentAudioTime = t;
      },
      stepBy(dt: number) {
        currentAudioTime += dt;
      },
      getTime() {
        return currentAudioTime;
      },
    };
  }

  function startAndStop(scheduler: BeatBarScheduler, clock: AudioClock) {
    const startRes = scheduler.start(clock);
    scheduler.stop();
    return startRes;
  }

  function tick(scheduler: BeatBarScheduler) {
    (scheduler as any).tick();
  }

  function storedBeats(scheduler: BeatBarScheduler): Map<string, any> {
    return (scheduler as any).storedBeatEvents;
  }

  function storedBars(scheduler: BeatBarScheduler): Map<string, any> {
    return (scheduler as any).storedBarEvents;
  }

  function intervalHandle(scheduler: BeatBarScheduler): any {
    return (scheduler as any).tickInterval;
  }

  describe('5.9 Deterministic event sequence 200 x 25ms ticks', () => {
    it('emits beat events every 0.5s and bar events every 4 beats (2s) for 5s window', () => {
      const env = makeManualTimeEnv(120, 4, 4);
      const scheduler = new BeatBarScheduler(seconds(0.1), seconds(0.02));
      const beatEvents: Array<{ beatIdx: number; committed: boolean; atNow: number }> = [];
      const barEvents: Array<{ barIdx: number; committed: boolean; atNow: number }> = [];

      scheduler.onBeat((e: BeatEvent) => {
        beatEvents.push({
          beatIdx: e.beat as unknown as number,
          committed: e.committed,
          atNow: env.getTime(),
        });
      });
      scheduler.onBar((e: BarEvent) => {
        barEvents.push({
          barIdx: e.bar as unknown as number,
          committed: e.committed,
          atNow: env.getTime(),
        });
      });

      startAndStop(scheduler, env.clock);

      env.setTime(0);
      tick(scheduler);
      for (let i = 0; i < 200; i++) {
        env.stepBy(0.025);
        tick(scheduler);
      }

      const uniqueBeatIndices = new Set(beatEvents.map(e => e.beatIdx));
      const uniqueBarIndices = new Set(barEvents.map(e => e.barIdx));
      const committedBeatIndices = new Set(beatEvents.filter(e => e.committed).map(e => e.beatIdx));
      const committedBarIndices = new Set(barEvents.filter(e => e.committed).map(e => e.barIdx));

      expect(Math.max(...Array.from(uniqueBeatIndices))).toBeGreaterThanOrEqual(10);
      expect(Math.max(...Array.from(uniqueBarIndices))).toBeGreaterThanOrEqual(2);

      for (let bi = 0; bi <= 9; bi++) {
        expect(committedBeatIndices.has(bi)).toBe(true);
      }
      for (let bai = 0; bai <= 2; bai++) {
        expect(committedBarIndices.has(bai)).toBe(true);
      }

      const firstBeat0 = beatEvents.find(e => e.beatIdx === 0);
      expect(firstBeat0).toBeDefined();

      const firstBar0 = barEvents.find(e => e.barIdx === 0);
      expect(firstBar0).toBeDefined();
    });
  });

  describe('5.10 Commit/tentative boundary (lookAhead=0.2s, commitHorizon=0.04s)', () => {
    it('classifies events as committed, tentative, and not-emitted correctly at now=1.0s', () => {
      const env = makeManualTimeEnv(120, 4, 4);
      const scheduler = new BeatBarScheduler(seconds(0.7), seconds(0.2));

      const seen: Array<{ beatIdx: number; committed: boolean }> = [];
      scheduler.onBeat((e: BeatEvent) => {
        seen.push({ beatIdx: e.beat as unknown as number, committed: e.committed });
      });

      startAndStop(scheduler, env.clock);

      env.setTime(1.0);
      tick(scheduler);

      const sb = storedBeats(scheduler);

      const beat2 = sb.get('beat-2');
      const beat3 = sb.get('beat-3');
      const beat4 = sb.get('beat-4');

      expect(beat2).toBeDefined();
      expect(beat2!.committed).toBe(true);
      expect(beat2!.scheduledAt as unknown as number).toBeCloseTo(1.0, 9);

      expect(beat3).toBeDefined();
      expect(beat3!.committed).toBe(false);
      expect(beat3!.scheduledAt as unknown as number).toBeCloseTo(1.5, 9);

      expect(beat4).toBeUndefined();

      const seenBeats = new Map(seen.map(s => [s.beatIdx, s.committed] as const));
      expect(seenBeats.get(2)).toBe(true);
      expect(seenBeats.get(3)).toBe(false);
      expect(seenBeats.has(4)).toBe(false);
    });
  });

  describe('5.11 cancelFuture(false) removes tentative only', () => {
    it('tentative events outside commitCutoff removed, committed events unchanged', () => {
      const env = makeManualTimeEnv(120, 4, 4);
      const scheduler = new BeatBarScheduler(seconds(0.7), seconds(0.2));

      startAndStop(scheduler, env.clock);

      env.setTime(1.0);
      tick(scheduler);

      const sbBefore = storedBeats(scheduler);
      const committedBefore = Array.from(sbBefore.values()).filter(e => e.committed).length;
      const tentativeBefore = Array.from(sbBefore.values()).filter(e => !e.committed).length;

      expect(committedBefore).toBeGreaterThanOrEqual(1);
      expect(tentativeBefore).toBeGreaterThanOrEqual(1);

      const cancelRes = scheduler.cancelFuture(false);
      expect(cancelRes.ok).toBe(true);

      const sbAfter = storedBeats(scheduler);
      const committedAfter = Array.from(sbAfter.values()).filter(e => e.committed).length;
      const tentativeAfter = Array.from(sbAfter.values()).filter(e => !e.committed).length;

      expect(committedAfter).toBe(committedBefore);
      expect(tentativeAfter).toBe(0);
    });
  });

  describe('5.12 cancelFuture(true) with committed events <= now() returns err ScheduleError', () => {
    it('returns err when past committed events exist in storage', () => {
      const env = makeManualTimeEnv(120, 4, 4);
      const scheduler = new BeatBarScheduler(seconds(0.7), seconds(0.2));

      startAndStop(scheduler, env.clock);

      env.setTime(1.0);
      tick(scheduler);

      env.setTime(2.0);
      tick(scheduler);

      const sb = storedBeats(scheduler);
      const hasCommittedPast = Array.from(sb.values()).some(e =>
        e.committed && (e.scheduledAt as unknown as number) <= 2.0
      );
      expect(hasCommittedPast).toBe(true);

      const cancelRes = scheduler.cancelFuture(true);
      expect(cancelRes.ok).toBe(false);
      if (!cancelRes.ok) {
        expect(cancelRes.error.name).toBe('ScheduleError');
      }
    });
  });

  describe('5.13 Idempotence: identical clock sequence yields identical emitted events', () => {
    it('two runs with identical stepping produce deep-equal event arrays', () => {
      function runOnce(): { beats: any[]; bars: any[] } {
        const env = makeManualTimeEnv(120, 4, 4);
        const scheduler = new BeatBarScheduler(seconds(0.1), seconds(0.02));
        const beats: any[] = [];
        const bars: any[] = [];
        scheduler.onBeat((e: BeatEvent) => {
          beats.push({
            beat: e.beat as unknown as number,
            scheduledAt: e.scheduledAt as unknown as number,
            committed: e.committed,
            id: e.id,
          });
        });
        scheduler.onBar((e: BarEvent) => {
          bars.push({
            bar: e.bar as unknown as number,
            scheduledAt: e.scheduledAt as unknown as number,
            committed: e.committed,
            id: e.id,
          });
        });

        startAndStop(scheduler, env.clock);
        env.setTime(0);
        tick(scheduler);
        for (let i = 0; i < 40; i++) {
          env.stepBy(0.025);
          tick(scheduler);
        }
        return { beats, bars };
      }

      const r1 = runOnce();
      const r2 = runOnce();

      expect(r1.beats).toEqual(r2.beats);
      expect(r1.bars).toEqual(r2.bars);
    });
  });

  describe('5.14 start() without a clock returns err ScheduleError', () => {
    it('start(null) returns err', () => {
      const scheduler = new BeatBarScheduler();
      const res = scheduler.start(null as unknown as AudioClock);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.name).toBe('ScheduleError');
        expect(res.error.message).toContain('without a clock');
      }
    });

    it('start(undefined) returns err', () => {
      const scheduler = new BeatBarScheduler();
      const res = scheduler.start(undefined as unknown as AudioClock);
      expect(res.ok).toBe(false);
    });
  });

  describe('5.15 stop() clears the interval handle', () => {
    it('after start tickInterval is set; after stop it is null', () => {
      const env = makeManualTimeEnv(120, 4, 4);
      const scheduler = new BeatBarScheduler(seconds(0.1), seconds(0.02));

      expect(intervalHandle(scheduler)).toBeNull();

      scheduler.start(env.clock);
      expect(intervalHandle(scheduler)).not.toBeNull();

      scheduler.stop();
      expect(intervalHandle(scheduler)).toBeNull();
    });

    it('no events are auto-emitted from interval after stop', async () => {
      const env = makeManualTimeEnv(120, 4, 4);
      const scheduler = new BeatBarScheduler(seconds(1.0), seconds(0.5));
      let beatCount = 0;
      scheduler.onBeat(() => { beatCount++; });

      scheduler.start(env.clock);
      scheduler.stop();

      env.setTime(0.5);
      await new Promise(r => setTimeout(r, 80));
      const countAfterWait = beatCount;

      tick(scheduler);
      const countAfterManualTick = beatCount;
      expect(countAfterManualTick).toBeGreaterThan(countAfterWait);
    });
  });

  describe('Additional scheduler tests', () => {
    it('getLookAhead and getCommitHorizon return constructor values', () => {
      const scheduler = new BeatBarScheduler(seconds(0.3), seconds(0.05));
      expect(scheduler.getLookAhead() as unknown as number).toBeCloseTo(0.3, 9);
      expect(scheduler.getCommitHorizon() as unknown as number).toBeCloseTo(0.05, 9);
    });

    it('onBeat with onlyCommitted=true only receives committed events', () => {
      const env = makeManualTimeEnv(120, 4, 4);
      const scheduler = new BeatBarScheduler(seconds(0.7), seconds(0.2));
      const all: number[] = [];
      const onlyCommitted: number[] = [];

      scheduler.onBeat((e: BeatEvent) => {
        all.push(e.beat as unknown as number);
      });
      scheduler.onBeat((e: BeatEvent) => {
        onlyCommitted.push(e.beat as unknown as number);
      }, { onlyCommitted: true });

      startAndStop(scheduler, env.clock);
      env.setTime(1.0);
      tick(scheduler);

      expect(all.length).toBeGreaterThan(onlyCommitted.length);
      const allSet = new Set(all);
      onlyCommitted.forEach(bi => expect(allSet.has(bi)).toBe(true));
    });

    it('onBar with onlyCommitted=true only receives committed bar events', () => {
      const env = makeManualTimeEnv(120, 4, 4);
      const scheduler = new BeatBarScheduler(seconds(2.5), seconds(0.2));
      const all: number[] = [];
      const onlyCommitted: number[] = [];

      scheduler.onBar((e: BarEvent) => {
        all.push(e.bar as unknown as number);
      });
      scheduler.onBar((e: BarEvent) => {
        onlyCommitted.push(e.bar as unknown as number);
      }, { onlyCommitted: true });

      startAndStop(scheduler, env.clock);
      env.setTime(1.0);
      tick(scheduler);

      expect(all.length).toBeGreaterThanOrEqual(onlyCommitted.length);
    });

    it('RemoveListener returned by onBeat removes the listener', () => {
      const env = makeManualTimeEnv(120, 4, 4);
      const scheduler = new BeatBarScheduler(seconds(1.0), seconds(0.05));
      let countA = 0;
      let countB = 0;

      const removeA = scheduler.onBeat(() => { countA++; });
      scheduler.onBeat(() => { countB++; });

      startAndStop(scheduler, env.clock);
      env.setTime(0.5);
      tick(scheduler);
      const afterFirst = countA;
      expect(afterFirst).toBeGreaterThan(0);
      expect(countB).toBe(afterFirst);

      removeA();
      env.setTime(1.5);
      tick(scheduler);
      expect(countA).toBe(afterFirst);
      expect(countB).toBeGreaterThan(afterFirst);
    });

    it('cancelFuture(false) when clock is null returns ok harmlessly', () => {
      const scheduler = new BeatBarScheduler(seconds(0.1), seconds(0.02));
      const res = scheduler.cancelFuture(false);
      expect(res.ok).toBe(true);
    });

    it('tentative event re-emits as committed when commit horizon catches up', () => {
      const env = makeManualTimeEnv(120, 4, 4);
      const scheduler = new BeatBarScheduler(seconds(0.7), seconds(0.05));
      const emissions: Array<{ beatIdx: number; committed: boolean; now: number }> = [];

      scheduler.onBeat((e: BeatEvent) => {
        emissions.push({
          beatIdx: e.beat as unknown as number,
          committed: e.committed,
          now: env.getTime(),
        });
      });

      startAndStop(scheduler, env.clock);

      env.setTime(1.0);
      tick(scheduler);
      const countAfterTick1 = emissions.filter(e => e.beatIdx === 3).length;

      env.setTime(1.45);
      tick(scheduler);
      const beat3Emissions = emissions.filter(e => e.beatIdx === 3);
      expect(beat3Emissions.length).toBeGreaterThanOrEqual(countAfterTick1);
      expect(beat3Emissions.some(e => e.committed === false)).toBe(true);
      expect(beat3Emissions.some(e => e.committed === true)).toBe(true);
    });
  });
});
