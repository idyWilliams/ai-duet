import type { SecondsTime, BeatTime, BarTime, ScheduleError, Result } from '../types/index.js';
import type { IClock } from '../clock/types.js';

export type BeatEvent = {
  beat: BeatTime;
  scheduledAt: SecondsTime;
  committed: boolean;
  id: string;
};

export type BarEvent = {
  bar: BarTime;
  scheduledAt: SecondsTime;
  committed: boolean;
  id: string;
};

export type RemoveListener = () => void;

export interface IBeatBarScheduler {
  start(clock: IClock): Result<void, ScheduleError>;
  stop(): void;
  onBeat(
    listener: (e: BeatEvent) => void,
    opts?: { onlyCommitted?: boolean }
  ): RemoveListener;
  onBar(
    listener: (e: BarEvent) => void,
    opts?: { onlyCommitted?: boolean }
  ): RemoveListener;
  cancelFuture(force?: boolean): Result<void, ScheduleError>;
  getLookAhead(): SecondsTime;
  getCommitHorizon(): SecondsTime;
}
