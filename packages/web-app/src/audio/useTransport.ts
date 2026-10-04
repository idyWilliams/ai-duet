import { useState, useEffect } from 'react';
import {
  ITransport,
  ClickTrackTransport,
  Turn,
  SecondsTime,
  seconds,
  Result,
  TransportError,
} from '@ai-duet/audio-core';
import { SONGS } from '../data/mockSongs';

const globalTransport = new ClickTrackTransport();
export const getTransport = () => globalTransport;

export interface UseTransportReturn {
  currentSeconds: SecondsTime;
  isPlaying: boolean;
  currentTurn: Turn;
  play: () => Result<void, TransportError>;
  pause: () => Result<void, TransportError>;
  seek: (n: number) => Result<void, TransportError>;
  transport: ITransport;
  clickTrack: ClickTrackTransport;
  durationSeconds: SecondsTime;
}

export function useTransport(): UseTransportReturn {
  const transport = getTransport();
  const clickTrack = transport as ClickTrackTransport;
  const firstSong = SONGS[0];
  const fallbackDuration = seconds(180);
  const durationSeconds = firstSong
    ? seconds(firstSong.totalDurationSeconds)
    : fallbackDuration;

  const [currentSeconds, setCurrentSeconds] = useState<SecondsTime>(
    transport.currentSeconds()
  );
  const [isPlaying, setIsPlaying] = useState<boolean>(transport.isPlaying());
  const [currentTurn, setCurrentTurn] = useState<Turn>(transport.currentTurn());

  useEffect(() => {
    const unsubPosition = transport.onPositionChange((payload) => {
      setCurrentSeconds(payload.seconds);
      setIsPlaying(payload.isPlaying);
    });
    const unsubTurn = transport.onTurnChange((turn) => {
      setCurrentTurn(turn);
    });

    return () => {
      unsubPosition();
      unsubTurn();
    };
  }, [transport]);

  const play = (): Result<void, TransportError> => transport.play();
  const pause = (): Result<void, TransportError> => transport.pause();
  const seek = (n: number): Result<void, TransportError> =>
    transport.seek(seconds(n));

  return {
    currentSeconds,
    isPlaying,
    currentTurn,
    play,
    pause,
    seek,
    transport,
    clickTrack,
    durationSeconds,
  };
}
