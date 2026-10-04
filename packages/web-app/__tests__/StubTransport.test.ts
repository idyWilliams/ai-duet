import { describe, it, expect, afterEach, vi } from 'vitest';
import { StubTransport, seconds } from '@ai-duet/audio-core';

describe('StubTransport (ITransport contract)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('play() returns Result.err with error.kind === NotImplemented', () => {
    const t = new StubTransport();
    const result = t.play();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('NotImplemented');
    }
  });

  it('pause() returns Result.err with error.kind === NotImplemented', () => {
    const t = new StubTransport();
    const result = t.pause();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('NotImplemented');
    }
  });

  it('seek(seconds(10)) returns Result.err with error.kind === NotImplemented', () => {
    const t = new StubTransport();
    const result = t.seek(seconds(10));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('NotImplemented');
    }
  });

  it('currentTurn() starts as human', () => {
    const t = new StubTransport();
    expect(t.currentTurn()).toBe('human');
  });

  it('removing onTurnChange listener does not throw (idempotent)', () => {
    const t = new StubTransport();
    const unsub = t.onTurnChange(() => {});
    expect(() => unsub()).not.toThrow();
    expect(() => unsub()).not.toThrow();
  });

  it('stop() returns ok, clears position/turn listeners and stops any running mock ticker', () => {
    vi.useFakeTimers();
    const t = new StubTransport();
    let posCount = 0;
    let turnCount = 0;
    const unsubPos = t.onPositionChange(() => { posCount += 1; });
    const unsubTurn = t.onTurnChange(() => { turnCount += 1; });
    t.startMockTicker(seconds(16), 100);
    vi.advanceTimersByTime(500);
    const beforePos = posCount;
    expect(beforePos).toBeGreaterThan(0);

    const stopRes = t.stop();
    expect(stopRes.ok).toBe(true);

    vi.advanceTimersByTime(5000);
    expect(posCount).toBe(beforePos);
    expect(turnCount).toBe(0);

    unsubPos();
    unsubTurn();
  });

  it('double stop() is safe and returns ok each time (idempotent cleanup)', () => {
    const t = new StubTransport();
    expect(t.stop().ok).toBe(true);
    expect(t.stop().ok).toBe(true);
  });

  it('startMockTicker with stopMockTicker leaves isPlaying false with no pending timers', () => {
    vi.useFakeTimers();
    const t = new StubTransport();
    t.startMockTicker(seconds(10), 50);
    expect(t.isPlaying()).toBe(true);
    t.stopMockTicker();
    expect(t.isPlaying()).toBe(false);
    let fires = 0;
    t.onPositionChange(() => { fires += 1; });
    vi.advanceTimersByTime(2000);
    expect(fires).toBe(0);
  });
});
