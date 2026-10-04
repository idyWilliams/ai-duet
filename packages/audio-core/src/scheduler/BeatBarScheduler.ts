import type {
  IBeatBarScheduler,
  BeatEvent,
  BarEvent,
  RemoveListener,
} from './types.js';
import type { IClock } from '../clock/types.js';
import {
  seconds,
  beat,
  bar,
  ok,
  err,
  type SecondsTime,
  type ScheduleError,
  type Result,
} from '../types/index.js';
import { ScheduleError as ScheduleErrorClass } from '../types/errors.js';

const DEFAULT_BEATS_PER_BAR = 4;

type StoredBeatEvent = BeatEvent & { committedEmitted: boolean };
type StoredBarEvent = BarEvent & { committedEmitted: boolean };

export class BeatBarScheduler implements IBeatBarScheduler {
  private clock: IClock | null = null;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private readonly lookAhead: SecondsTime;
  private readonly commitHorizon: SecondsTime;

  private lastEmittedBeat: number = -1;
  private lastEmittedBar: number = -1;
  private lastCommittedEmittedBeat: number = -1;
  private lastCommittedEmittedBar: number = -1;

  private readonly beatAnyListeners: Array<(e: BeatEvent) => void> = [];
  private readonly beatCommittedListeners: Array<(e: BeatEvent) => void> = [];
  private readonly barAnyListeners: Array<(e: BarEvent) => void> = [];
  private readonly barCommittedListeners: Array<(e: BarEvent) => void> = [];

  private readonly storedBeatEvents: Map<string, StoredBeatEvent> = new Map();
  private readonly storedBarEvents: Map<string, StoredBarEvent> = new Map();

  constructor(
    lookAhead: SecondsTime = seconds(0.1),
    commitHorizon: SecondsTime = seconds(0.02)
  ) {
    this.lookAhead = lookAhead;
    this.commitHorizon = commitHorizon;
  }

  start(clock: IClock): Result<void, ScheduleError> {
    if (clock === null || clock === undefined) {
      return err(new ScheduleErrorClass('Cannot start scheduler without a clock'));
    }
    this.clock = clock;
    this.lastEmittedBeat = -1;
    this.lastEmittedBar = -1;
    this.lastCommittedEmittedBeat = -1;
    this.lastCommittedEmittedBar = -1;
    this.storedBeatEvents.clear();
    this.storedBarEvents.clear();

    this.tickInterval = setInterval(() => {
      this.tick();
    }, 25);

    return ok(undefined);
  }

  stop(): void {
    if (this.tickInterval !== null) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  onBeat(
    listener: (e: BeatEvent) => void,
    opts?: { onlyCommitted?: boolean }
  ): RemoveListener {
    const list = opts?.onlyCommitted === true
      ? this.beatCommittedListeners
      : this.beatAnyListeners;
    list.push(listener);
    return () => {
      const idx = list.indexOf(listener);
      if (idx !== -1) list.splice(idx, 1);
    };
  }

  onBar(
    listener: (e: BarEvent) => void,
    opts?: { onlyCommitted?: boolean }
  ): RemoveListener {
    const list = opts?.onlyCommitted === true
      ? this.barCommittedListeners
      : this.barAnyListeners;
    list.push(listener);
    return () => {
      const idx = list.indexOf(listener);
      if (idx !== -1) list.splice(idx, 1);
    };
  }

  getLookAhead(): SecondsTime {
    return this.lookAhead;
  }

  getCommitHorizon(): SecondsTime {
    return this.commitHorizon;
  }

  cancelFuture(force: boolean = false): Result<void, ScheduleError> {
    const c = this.clock;
    if (c === null) {
      return ok(undefined);
    }
    const now = c.now();
    const commitCutoff = seconds((now as number) + (this.commitHorizon as number));

    if (force === false) {
      for (const [id, ev] of this.storedBeatEvents) {
        if (!ev.committed && ev.scheduledAt > commitCutoff) {
          this.storedBeatEvents.delete(id);
        }
      }
      for (const [id, ev] of this.storedBarEvents) {
        if (!ev.committed && ev.scheduledAt > commitCutoff) {
          this.storedBarEvents.delete(id);
        }
      }
      return ok(undefined);
    }

    for (const [, ev] of this.storedBeatEvents) {
      if (ev.committed && ev.scheduledAt <= now) {
        return err(
          new ScheduleErrorClass(
            'Cannot cancel committed events at or past current audio time'
          )
        );
      }
    }
    for (const [, ev] of this.storedBarEvents) {
      if (ev.committed && ev.scheduledAt <= now) {
        return err(
          new ScheduleErrorClass(
            'Cannot cancel committed events at or past current audio time'
          )
        );
      }
    }

    this.storedBeatEvents.clear();
    this.storedBarEvents.clear();
    return ok(undefined);
  }

  private tick(): void {
    const c = this.clock;
    if (c === null) return;

    const now = c.now();
    const nowNum = now as number;
    const windowEnd = seconds(nowNum + (this.lookAhead as number));
    const commitThreshold = seconds(nowNum + (this.commitHorizon as number));

    const firstBeatIdx = Math.floor(c.secondsToBeat(now) as number);
    const lastBeatIdx = Math.floor(c.secondsToBeat(windowEnd) as number);

    for (let bi = firstBeatIdx; bi <= lastBeatIdx; bi++) {
      if (bi < 0) continue;
      const beatStartSecs = c.beatToSeconds(beat(bi));
      const isCommitted = (beatStartSecs as number) <= (commitThreshold as number);
      const id = `beat-${bi}`;

      const existing = this.storedBeatEvents.get(id);

      if (existing === undefined) {
        const ev: StoredBeatEvent = {
          beat: beat(bi),
          scheduledAt: beatStartSecs,
          committed: isCommitted,
          id,
          committedEmitted: isCommitted,
        };
        this.storedBeatEvents.set(id, ev);

        if (bi > this.lastEmittedBeat) {
          this.emitBeatAny(ev);
          this.lastEmittedBeat = bi;
        }
        if (isCommitted && bi > this.lastCommittedEmittedBeat) {
          this.emitBeatCommitted(ev);
          this.lastCommittedEmittedBeat = bi;
        }
      } else {
        if (isCommitted && !existing.committedEmitted) {
          existing.committed = true;
          existing.committedEmitted = true;
          this.emitBeatAny(existing);
          this.emitBeatCommitted(existing);
          if (bi > this.lastEmittedBeat) this.lastEmittedBeat = bi;
          if (bi > this.lastCommittedEmittedBeat) this.lastCommittedEmittedBeat = bi;
        }
      }
    }

    const firstBarIdx = Math.floor((c.secondsToBeat(now) as number) / DEFAULT_BEATS_PER_BAR);
    const lastBarIdx = Math.floor((c.secondsToBeat(windowEnd) as number) / DEFAULT_BEATS_PER_BAR);

    for (let bai = firstBarIdx; bai <= lastBarIdx; bai++) {
      if (bai < 0) continue;
      const barBeatIdx = bai * DEFAULT_BEATS_PER_BAR;
      const barStartSecs = c.beatToSeconds(beat(barBeatIdx));
      const isCommitted = (barStartSecs as number) <= (commitThreshold as number);
      const id = `bar-${bai}`;

      const existing = this.storedBarEvents.get(id);

      if (existing === undefined) {
        const ev: StoredBarEvent = {
          bar: bar(bai),
          scheduledAt: barStartSecs,
          committed: isCommitted,
          id,
          committedEmitted: isCommitted,
        };
        this.storedBarEvents.set(id, ev);

        if (bai > this.lastEmittedBar) {
          this.emitBarAny(ev);
          this.lastEmittedBar = bai;
        }
        if (isCommitted && bai > this.lastCommittedEmittedBar) {
          this.emitBarCommitted(ev);
          this.lastCommittedEmittedBar = bai;
        }
      } else {
        if (isCommitted && !existing.committedEmitted) {
          existing.committed = true;
          existing.committedEmitted = true;
          this.emitBarAny(existing);
          this.emitBarCommitted(existing);
          if (bai > this.lastEmittedBar) this.lastEmittedBar = bai;
          if (bai > this.lastCommittedEmittedBar) this.lastCommittedEmittedBar = bai;
        }
      }
    }
  }

  private emitBeatAny(ev: BeatEvent): void {
    for (const l of this.beatAnyListeners) l(ev);
  }

  private emitBeatCommitted(ev: BeatEvent): void {
    for (const l of this.beatCommittedListeners) l(ev);
  }

  private emitBarAny(ev: BarEvent): void {
    for (const l of this.barAnyListeners) l(ev);
  }

  private emitBarCommitted(ev: BarEvent): void {
    for (const l of this.barCommittedListeners) l(ev);
  }
}
