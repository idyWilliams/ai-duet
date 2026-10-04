import { describe, it, expect } from 'vitest';
import { StubTransport, seconds } from '@ai-duet/audio-core';

describe('StubTransport', () => {
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

  it('removing onTurnChange listener does not throw', () => {
    const t = new StubTransport();
    const unsub = t.onTurnChange(() => {});
    expect(() => unsub()).not.toThrow();
    expect(() => unsub()).not.toThrow();
  });
});
