import { ITransport, StubTransport, Turn, SecondsTime, Result, TransportError } from '@ai-duet/audio-core';
export declare const getTransport: () => StubTransport;
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
export declare function useTransport(): UseTransportReturn;
