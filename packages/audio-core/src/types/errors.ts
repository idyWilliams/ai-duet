export class AudioClockError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'AudioClockError';
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

export class ScheduleError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'ScheduleError';
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}
