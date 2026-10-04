import type {
  ITransport,
  PositionUpdate,
  RemoveListener,
  TransportError,
  Turn,
} from './types.js';
import { seconds, err, ok, type SecondsTime, type Result } from '../types/index.js';

export class StubTransport implements ITransport {
  private readonly positionListeners: Array<(u: PositionUpdate) => void> = [];
  private readonly turnListeners: Array<(t: Turn) => void> = [];
  private _currentTurn: Turn = 'human';
  private _currentSeconds: SecondsTime = seconds(0);
  private _isPlaying: boolean = false;
  private tickerInterval: ReturnType<typeof setInterval> | null = null;
  private tickerStartWall: number = 0;
  private tickerDuration: SecondsTime = seconds(0);
  private tickerIntervalMs: number = 500;
  private lastTurnSwitchElapsed: number = 0;
  private pausedElapsed: number = 0;

  play(): Result<void, TransportError> {
    return err({
      kind: 'NotImplemented',
      message: 'Transport audio not wired in M1',
    });
  }

  pause(): Result<void, TransportError> {
    return err({
      kind: 'NotImplemented',
      message: 'Transport audio not wired in M1',
    });
  }

  seek(target: SecondsTime): Result<void, TransportError> {
    return err({
      kind: 'NotImplemented',
      message: 'Transport audio not wired in M1',
    });
  }

  stop(): Result<void, TransportError> {
    this.stopMockTicker();
    this.positionListeners.length = 0;
    this.turnListeners.length = 0;
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

  startMockTicker(
    durationSeconds: SecondsTime,
    intervalMs: number = 500
  ): void {
    this.stopMockTicker();
    this.tickerDuration = durationSeconds;
    this.tickerIntervalMs = intervalMs;
    this.tickerStartWall = Date.now() - this.pausedElapsed * 1000;
    this.lastTurnSwitchElapsed = 0;
    this._isPlaying = true;

    this.tickerInterval = setInterval(() => {
      const elapsedWall = Date.now() - this.tickerStartWall;
      let elapsedSeconds = elapsedWall / 1000;
      const durationAsNumber = this.tickerDuration as number;
      if (durationAsNumber > 0 && elapsedSeconds >= durationAsNumber) {
        elapsedSeconds = 0;
        this.tickerStartWall = Date.now();
        this.lastTurnSwitchElapsed = 0;
        this._currentTurn = 'human';
      }
      const clamped = Math.min(elapsedSeconds, durationAsNumber > 0 ? durationAsNumber : elapsedSeconds);
      this._currentSeconds = seconds(clamped);
      const update: PositionUpdate = {
        seconds: this._currentSeconds,
        isPlaying: this._isPlaying,
      };
      for (const l of this.positionListeners) l(update);

      if (clamped - this.lastTurnSwitchElapsed >= 8) {
        this._currentTurn = this._currentTurn === 'human' ? 'ai' : 'human';
        this.lastTurnSwitchElapsed = clamped;
        for (const l of this.turnListeners) l(this._currentTurn);
      }
    }, this.tickerIntervalMs);
  }

  stopMockTicker(): void {
    if (this.tickerInterval !== null) {
      clearInterval(this.tickerInterval);
      this.tickerInterval = null;
    }
    this._isPlaying = false;
  }

  demoPauseTicker(): void {
    if (this.tickerInterval !== null) {
      const elapsedWall = Date.now() - this.tickerStartWall;
      this.pausedElapsed = elapsedWall / 1000;
      clearInterval(this.tickerInterval);
      this.tickerInterval = null;
    }
    this._isPlaying = false;
    const update: PositionUpdate = {
      seconds: this._currentSeconds,
      isPlaying: this._isPlaying,
    };
    for (const l of this.positionListeners) l(update);
  }

  demoResumeTicker(): void {
    if (this.tickerInterval === null && (this.tickerDuration as number) > 0) {
      this.startMockTicker(this.tickerDuration, this.tickerIntervalMs);
    } else if (this.tickerInterval === null) {
      this._isPlaying = true;
      const update: PositionUpdate = {
        seconds: this._currentSeconds,
        isPlaying: this._isPlaying,
      };
      for (const l of this.positionListeners) l(update);
    }
  }

  demoSeek(target: SecondsTime): void {
    let val = target as number;
    const total = this.tickerDuration as number;
    if (val < 0) val = 0;
    if (total > 0 && val > total) val = total;
    this._currentSeconds = seconds(val);
    this.pausedElapsed = val;
    this.tickerStartWall = Date.now() - val * 1000;
    const bucket = Math.floor(val / 8);
    const newTurn: Turn = bucket % 2 === 0 ? 'human' : 'ai';
    if (newTurn !== this._currentTurn) {
      this._currentTurn = newTurn;
      for (const l of this.turnListeners) l(this._currentTurn);
    }
    this.lastTurnSwitchElapsed = bucket * 8;
    const update: PositionUpdate = {
      seconds: this._currentSeconds,
      isPlaying: this._isPlaying,
    };
    for (const l of this.positionListeners) l(update);
  }
}
