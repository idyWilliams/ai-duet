import { useState, useEffect } from 'react';
import { StubTransport, seconds, } from '@ai-duet/audio-core';
import { SONGS } from '../data/mockSongs';
const globalTransport = new StubTransport();
export const getTransport = () => globalTransport;
export function useTransport() {
    const transport = getTransport();
    const firstSong = SONGS[0];
    const fallbackDuration = seconds(180);
    const durationSeconds = firstSong
        ? seconds(firstSong.totalDurationSeconds)
        : fallbackDuration;
    const [currentSeconds, setCurrentSeconds] = useState(transport.currentSeconds());
    const [isPlaying, setIsPlaying] = useState(transport.isPlaying());
    const [currentTurn, setCurrentTurn] = useState(transport.currentTurn());
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
    const play = () => {
        const stub = transport;
        stub.demoResumeTicker();
        return transport.play();
    };
    const pause = () => {
        const stub = transport;
        stub.demoPauseTicker();
        return transport.pause();
    };
    const seek = (n) => {
        const stub = transport;
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
