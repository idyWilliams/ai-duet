import type { SecondsTime, Result } from '../types/index.js';

export type Turn = 'human' | 'ai';

export interface PositionUpdate {
  seconds: SecondsTime;
  isPlaying: boolean;
}

export type RemoveListener = () => void;

export type TransportError =
  | { kind: 'NotImplemented'; message: string }
  | { kind: 'AudioContextUnavailable'; message: string }
  | { kind: 'SeekOutOfRange'; message: string; max: SecondsTime };

export interface ITransport {
  play(): Result<void, TransportError>;
  pause(): Result<void, TransportError>;
  seek(target: SecondsTime): Result<void, TransportError>;
  stop(): Result<void, TransportError>;
  onPositionChange(cb: (u: PositionUpdate) => void): RemoveListener;
  onTurnChange(cb: (t: Turn) => void): RemoveListener;
  currentTurn(): Turn;
  currentSeconds(): SecondsTime;
  isPlaying(): boolean;
  startMockTicker(totalDuration: SecondsTime, intervalMs: number): void;
  stopMockTicker(): void;
}
