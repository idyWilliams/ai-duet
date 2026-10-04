import type {
  SecondsTime,
  BeatTime,
  BarTime,
  ScorePositionReport,
  Turn,
  Result,
} from '@ai-duet/audio-core';

export type PlanHorizon = {
  lookAhead: SecondsTime;
  commitHorizon: SecondsTime;
};

export type PhraseTurn = Turn | 'both';

export type PlanId = string & { __tag: 'plan' };

export type Plan = {
  id: PlanId;
  phraseId: string;
  turn: PhraseTurn;
  scheduledStart: SecondsTime;
  durationSeconds: SecondsTime;
  committed: boolean;
  renderRequestId?: string;
};

export type RenderedVocal = {
  phraseId: string;
  buffer: Float32Array;
  sampleRate: 48000;
  renderDurationMs: number;
  checksum: string;
};

export type RenderRequest = {
  phraseId: string;
  turn: PhraseTurn;
  lyrics: string;
  melodyMidi: number[];
  startTime: SecondsTime;
  deadline: SecondsTime;
};

export type RenderError = {
  kind: 'RenderTimeout' | 'RenderRejected' | 'RenderQualityLow';
  message: string;
  fallbackCachedId?: string;
};

export type IPerformanceEngineTickState = {
  audioTime: SecondsTime;
  beat: BeatTime;
  bar: BarTime;
};

export interface IPerformanceEngine {
  tick(
    clockState: IPerformanceEngineTickState,
    scoreReport: ScorePositionReport,
    scoreLibrary: unknown
  ): { tentativePlans: Plan[]; committedPlans: Plan[] };
}

export interface ISingingEngine {
  render(
    req: RenderRequest,
    abortSignal: AbortSignal,
    timeoutMs: number
  ): Promise<Result<RenderedVocal, RenderError>>;
}

export class SingingEngineStub implements ISingingEngine {
  async render(
    _req: RenderRequest,
    _abortSignal: AbortSignal,
    _timeoutMs: number
  ): Promise<Result<RenderedVocal, RenderError>> {
    return Promise.resolve({
      ok: false,
      error: {
        kind: 'RenderRejected',
        message: 'SingingEngineStub: render not implemented in M1',
      },
    });
  }
}
