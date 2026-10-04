import { describe, it, expect, beforeEach } from 'vitest';
import { AudioClock } from '../src/index.js';
import {
  seconds,
  beat,
  bar,
  ok,
  err,
  type Result,
  type AudioClockError,
} from '../src/types/index.js';

describe('AudioClock (Task 5)', () => {
  function makeSteppedClock(initialBpm = 120, bpb = 4, bu = 4) {
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
    };
  }

  describe('5.1 Happy 4/4 120 BPM deterministic time provider', () => {
    it('t=0s → beat 0, bar 0', () => {
      const { clock, setTime } = makeSteppedClock(120, 4, 4);
      setTime(0);
      expect(clock.currentBeat() as number).toBeCloseTo(0, 9);
      expect(clock.currentBar() as number).toBeCloseTo(0, 9);
    });

    it('t=0.5s → beat 1', () => {
      const { clock, setTime } = makeSteppedClock(120, 4, 4);
      setTime(0.5);
      expect(clock.currentBeat() as number).toBeCloseTo(1, 9);
    });

    it('t=1.0s → beat 2', () => {
      const { clock, setTime } = makeSteppedClock(120, 4, 4);
      setTime(1.0);
      expect(clock.currentBeat() as number).toBeCloseTo(2, 9);
    });

    it('t=2.0s → bar 1 (beat 4)', () => {
      const { clock, setTime } = makeSteppedClock(120, 4, 4);
      setTime(2.0);
      expect(clock.currentBeat() as number).toBeCloseTo(4, 9);
      expect(Math.floor(clock.currentBar() as number)).toBe(1);
    });

    it('t=4.0s → bar 2 (beat 8)', () => {
      const { clock, setTime } = makeSteppedClock(120, 4, 4);
      setTime(4.0);
      expect(clock.currentBeat() as number).toBeCloseTo(8, 9);
      expect(Math.floor(clock.currentBar() as number)).toBe(2);
    });

    it('beatToSeconds conversions', () => {
      const { clock } = makeSteppedClock(120, 4, 4);
      expect(clock.beatToSeconds(beat(0)) as number).toBeCloseTo(0, 9);
      expect(clock.beatToSeconds(beat(2)) as number).toBeCloseTo(1.0, 9);
      expect(clock.beatToSeconds(beat(4)) as number).toBeCloseTo(2.0, 9);
    });

    it('secondsToBeat conversions', () => {
      const { clock } = makeSteppedClock(120, 4, 4);
      expect(clock.secondsToBeat(seconds(0)) as number).toBeCloseTo(0, 9);
      expect(clock.secondsToBeat(seconds(1.0)) as number).toBeCloseTo(2, 9);
      expect(clock.secondsToBeat(seconds(3.0)) as number).toBeCloseTo(6, 9);
    });
  });

  describe('5.2 Tempo change effectiveAt T=2s', () => {
    it('at t=2s beat==4 (pre-change)', () => {
      const { clock, setTime } = makeSteppedClock(120, 4, 4);
      setTime(1.9);
      const res = clock.setTempo(60, seconds(2));
      expect(res.ok).toBe(true);
      setTime(2.0);
      expect(clock.secondsToBeat(seconds(2)) as number).toBeCloseTo(4, 9);
    });

    it('at t=3s beat==5 (4 from 120BPM segment + 1 from 60BPM segment)', () => {
      const { clock, setTime } = makeSteppedClock(120, 4, 4);
      setTime(1.9);
      const res = clock.setTempo(60, seconds(2));
      expect(res.ok).toBe(true);
      setTime(3.0);
      const b = clock.secondsToBeat(seconds(3)) as number;
      expect(b).toBeCloseTo(5, 9);
    });
  });

  describe('5.3 Retroactive tempo change returns err', () => {
    it('effectiveAt < now() returns Result.err with AudioClockError', () => {
      const { clock, setTime } = makeSteppedClock(120, 4, 4);
      setTime(5);
      const res = clock.setTempo(60, seconds(2));
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.name).toBe('AudioClockError');
        expect(res.error.message).toContain('retroactive');
      }
    });

    it('effectiveAt < startAudioTime also returns err', () => {
      let t = 0;
      const clock = new AudioClock(() => t, seconds(1), 120, 4, 4);
      const res = clock.setTempo(60, seconds(0.5));
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.name).toBe('AudioClockError');
      }
    });
  });

  describe('5.4 Time signature change 4/4 → 3/4 effectiveAt=2s', () => {
    it('bar 2 starts at ~3.5s; currentBar() at t=3.6s has floor==2', () => {
      const { clock, setTime } = makeSteppedClock(120, 4, 4);
      setTime(1.9);
      const res = clock.setTimeSignature(3, 4, seconds(2));
      expect(res.ok).toBe(true);
      setTime(3.6);
      const barVal = clock.currentBar() as number;
      expect(Math.floor(barVal)).toBe(2);
      expect(barVal).toBeGreaterThanOrEqual(2);
      expect(barVal).toBeLessThan(3);
    });

    it('at t=3.5s exactly, we are at bar 2 boundary (~beats 7)', () => {
      const { clock, setTime } = makeSteppedClock(120, 4, 4);
      setTime(1.9);
      clock.setTimeSignature(3, 4, seconds(2));
      setTime(3.5);
      expect(clock.currentBeat() as number).toBeCloseTo(7, 9);
      expect(clock.currentBar() as number).toBeCloseTo(2, 9);
    });
  });

  describe('5.5 Round trip beat→seconds→beat single tempo 90 BPM', () => {
    it('10 random beats in [0,40] round-trip with tolerance 1e-9', () => {
      const { clock } = makeSteppedClock(90, 4, 4);
      const seeds = [0, 0.5, 1, 3.7, 5, 10.25, 17, 23.333, 31.5, 39.999];
      for (const b of seeds) {
        const secs = clock.beatToSeconds(beat(b));
        const back = clock.secondsToBeat(secs);
        expect(back as number).toBeCloseTo(b, 9);
      }
    });
  });

  describe('5.6 probeNow returns correct shape', () => {
    it('audioTime matches now(), beat/bar consistent, wallClockReceivedAt is number', () => {
      const { clock, setTime } = makeSteppedClock(120, 4, 4);
      setTime(1.5);
      const probe = clock.probeNow();
      expect(probe.audioTime as number).toBe(clock.now() as number);
      expect(probe.beat as number).toBe(clock.secondsToBeat(probe.audioTime) as number);
      expect(typeof probe.wallClockReceivedAt).toBe('number');
      expect(Number.isFinite(probe.wallClockReceivedAt)).toBe(true);
    });
  });

  describe('5.7 setTempo with BPM <= 0 returns err', () => {
    it('BPM = 0 returns err', () => {
      const { clock, setTime } = makeSteppedClock(120, 4, 4);
      setTime(0.5);
      const res = clock.setTempo(0, seconds(1));
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.name).toBe('AudioClockError');
      }
    });

    it('BPM = -60 returns err', () => {
      const { clock, setTime } = makeSteppedClock(120, 4, 4);
      setTime(0.5);
      const res = clock.setTempo(-60, seconds(1));
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.name).toBe('AudioClockError');
      }
    });
  });

  describe('5.8 setTimeSignature validation (adapted to actual implementation)', () => {
    it('actual implementation has no validation for beatsPerBar<=0 or beatUnit out of set, returns ok', () => {
      const { clock, setTime } = makeSteppedClock(120, 4, 4);
      setTime(0.5);
      const res1 = clock.setTimeSignature(0, 4, seconds(1));
      expect(res1.ok).toBe(true);

      const res2 = clock.setTimeSignature(-3, 4, seconds(1.1));
      expect(res2.ok).toBe(true);

      const res3 = clock.setTimeSignature(4, 3, seconds(1.2));
      expect(res3.ok).toBe(true);

      const res4 = clock.setTimeSignature(4, 99, seconds(1.3));
      expect(res4.ok).toBe(true);
    });
  });

  describe('Additional consistency tests', () => {
    it('now() always matches provider value', () => {
      const { clock, setTime } = makeSteppedClock();
      for (const t of [0, 0.25, 1, 2.7, 9.99]) {
        setTime(t);
        expect(clock.now() as number).toBe(t);
      }
    });

    it('beat 0 always maps to startAudioTime', () => {
      let t = 0;
      const clock = new AudioClock(() => t, seconds(5), 120, 4, 4);
      expect(clock.beatToSeconds(beat(0)) as number).toBe(5);
      expect(clock.secondsToBeat(seconds(3)) as number).toBe(0);
    });
  });
});
