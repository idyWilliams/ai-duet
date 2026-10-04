export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(v: T): Result<T, never> {
  return { ok: true, value: v };
}

export function err<E>(e: E): Result<never, E> {
  return { ok: false, error: e };
}
