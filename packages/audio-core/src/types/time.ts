export type SecondsTime = number & { readonly __tag: unique symbol };
export type BeatTime = number & { readonly __tag: unique symbol };
export type BarTime = number & { readonly __tag: unique symbol };
export type AudioFrameTime = number & { readonly __tag: unique symbol };
export type Confidence = number & { readonly __tag: unique symbol };

export function seconds(n: number): SecondsTime {
  return n as SecondsTime;
}

export function beat(n: number): BeatTime {
  return n as BeatTime;
}

export function bar(n: number): BarTime {
  return n as BarTime;
}

export function confidence(n: number): Confidence {
  const clamped = Math.max(0, Math.min(1, n));
  return clamped as Confidence;
}
