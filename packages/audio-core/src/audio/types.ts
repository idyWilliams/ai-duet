import type { SecondsTime, Confidence } from '../types/index.js';

export type LaneId = string;

export interface IAudioScheduler {
  scheduleBuffer(
    buffer: AudioBuffer,
    laneId: LaneId,
    startTime: SecondsTime
  ): { id: string };
  cancel(eventId: string): boolean;
  getLookAhead(): SecondsTime;
  getCommitHorizon(): SecondsTime;
}

export interface IMixer {
  createLane(): LaneId;
  setVolume(laneId: LaneId, volume: number): void;
  connectToDestination(laneId: LaneId): void;
}

export interface IBackingTrackLane {
  load(url: string): Promise<void>;
  startAt(time: SecondsTime): void;
  stop(): void;
}

export type AnalysisObservation = {
  atTime: SecondsTime;
  featureName: string;
  magnitude: number;
};

export interface IAnalyzer {
  processChunk(chunk: Float32Array, sampleRate: number): AnalysisObservation[];
}

export type ScorePositionReport = {
  songPositionSeconds: SecondsTime;
  sectionId: string;
  phraseId: string;
  confidence: Confidence;
};

export interface IScoreFollower {
  feed(chunk: Float32Array, sampleRate: number): ScorePositionReport;
}
