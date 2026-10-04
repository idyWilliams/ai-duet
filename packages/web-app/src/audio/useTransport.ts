import { useState, useEffect } from 'react';
import {
  ITransport,
  StubTransport,
  Turn,
  SecondsTime,
  seconds,
  Result,
  TransportError,
} from '@ai-duet/audio-core';
import { SONGS } from '../data/mockSongs';

const globalTransport = new StubTransport();
export const getTransport = () => globalTransport;

export interface UseTransportReturn {
  currentSeconds: SecondsTime;
  isPlaying: boolean;
  currentTurn: Turn;
  play: () => Result<void, TransportError>;
  pause: () => Result<void, TransportError>;
  seek: (n: number) => Result<void, TransportError>;
  transport: ITransport;
  durationSeconds: SecondsTime;
}

export function useTransport(): UseTransportReturn {
  const transport = getTransport();
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
    // UI-only demo ticker. Not used for audio scheduling in any way.
    const unsubPosition = transport.onPositionChange((payload) => {
      setCurrentSeconds(payload.seconds);
      setIsPlaying(payload.isPlaying);
    });
    const unsubTurn = transport.onTurnChange((turn) => {
      setCurrentTurn(turn);
    });

    transport.startMockTicker(durationSeconds, 500);

    return () => {
      transport.stopMockTicker();
      unsubPosition();
      unsubTurn();
    };
  }, [transport, durationSeconds]);

  const play = (): Result<void, TransportError> => {
    const stub = transport as StubTransport;
    stub.demoResumeTicker();
    return transport.play();
  };

  const pause = (): Result<void, TransportError> => {
    const stub = transport as StubTransport;
    stub.demoPauseTicker();
    return transport.pause();
  };

  const seek = (n: number): Result<void, TransportError> => {
    const stub = transport as StubTransport;
    stub.demoSeek(seconds(n));
    return transport.seek(seconds(n));
  };

  return {
    currentSeconds,
    isPlaying,
    currentTurn,
    play,
    pause,
    seek,
    transport,
    durationSeconds,
  };
}
