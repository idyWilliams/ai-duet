export type DuetMode = 'alternate-lines' | 'chorus-only' | 'harmony';
export interface Song {
    id: string;
    title: string;
    artist: string;
    description: string;
    totalDurationSeconds: number;
    coverGradient: string;
}
export type RouteName = 'home' | 'song-detail' | 'player';
