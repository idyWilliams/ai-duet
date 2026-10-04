import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useTransport } from '../audio/useTransport';
import { SONGS } from '../data/mockSongs';
function mocklyricsBySeconds(secs, _song) {
    const bucket = Math.floor(secs / 4) % 6;
    if (bucket === 0)
        return 'When the evening falls so quiet';
    if (bucket === 1)
        return 'And the stars begin to climb';
    if (bucket === 2)
        return 'We will sing a song together';
    if (bucket === 3)
        return 'Voice to voice and line by line';
    if (bucket === 4)
        return 'Through the chorus and the verses';
    return 'Harmonizing one last time';
}
function formatMode(mode) {
    if (mode === 'alternate-lines')
        return 'Alternate lines';
    if (mode === 'chorus-only')
        return 'Chorus only';
    if (mode === 'harmony')
        return 'Harmony';
    return 'Alternate lines';
}
function formatTime(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, '0')}`;
}
export default function Player() {
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const found = SONGS.find((s) => s.id === id);
    const fallback = SONGS[0];
    const song = found ?? fallback ?? {};
    const hasSong = found !== undefined || fallback !== undefined;
    const mode = searchParams.get('mode') ?? 'alternate-lines';
    const { currentSeconds, isPlaying, currentTurn, play, pause, seek, durationSeconds, } = useTransport();
    const effectiveDuration = hasSong && song.totalDurationSeconds > 0
        ? song.totalDurationSeconds
        : durationSeconds;
    const lyricsLine = useMemo(() => {
        if (!hasSong)
            return '';
        return mocklyricsBySeconds(currentSeconds, song);
    }, [currentSeconds, song, hasSong]);
    const turnClass = currentTurn === 'human' ? 'turn-pill-human' : 'turn-pill-ai';
    const turnLabel = currentTurn === 'human' ? 'You sing next' : 'AI sings next';
    if (!hasSong) {
        return (_jsxs("div", { className: "container", children: [_jsx("p", { children: "Song not found." }), _jsx(Link, { to: "/", children: "\u2190 Back home" })] }));
    }
    const songId = song.id;
    return (_jsxs("div", { className: "container", children: [_jsxs("div", { style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.5rem 0 1rem',
                    minHeight: 44,
                }, children: [_jsx(Link, { to: `/song/${songId}`, style: {
                            color: 'var(--color-muted)',
                            textDecoration: 'none',
                            minWidth: 44,
                            minHeight: 44,
                            display: 'inline-flex',
                            alignItems: 'center',
                        }, "aria-label": "Back", children: "\u2190" }), _jsx("div", { style: {
                            flex: 1,
                            textAlign: 'center',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontWeight: 600,
                            padding: '0 0.5rem',
                        }, children: song.title }), _jsx("div", { style: { minWidth: 44 } })] }), _jsx("div", { className: "player-cover", style: { background: song.coverGradient } }), _jsxs("div", { style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '1rem 0.25rem 0',
                    gap: '0.75rem',
                }, children: [_jsxs("div", { style: { minWidth: 0 }, children: [_jsx("div", { style: {
                                    fontWeight: 700,
                                    fontSize: '1.15rem',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }, children: song.title }), _jsx("div", { style: { color: 'var(--color-muted)', fontSize: '0.9rem' }, children: song.artist })] }), _jsx("div", { style: {
                            flexShrink: 0,
                            padding: '0.35rem 0.75rem',
                            borderRadius: 9999,
                            background: 'var(--color-surface)',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                        }, children: formatMode(mode) })] }), _jsx("div", { className: "lyrics-line", children: lyricsLine }), _jsx("div", { style: { textAlign: 'center', padding: '0.5rem 0' }, children: _jsx("span", { className: `turn-pill ${turnClass}`, children: turnLabel }) }), _jsxs("div", { className: "transport-row", children: [_jsx("button", { className: "skip-button", onClick: () => {
                            const cur = currentSeconds;
                            seek(Math.max(0, cur - 4));
                        }, "aria-label": "Previous phrase", children: "\u00AB" }), _jsx("button", { className: `play-button ${isPlaying ? '' : 'paused'}`, onClick: () => {
                            if (isPlaying)
                                pause();
                            else
                                play();
                        }, "aria-label": isPlaying ? 'Pause' : 'Play', children: isPlaying ? '❚❚' : '▶' }), _jsx("button", { className: "skip-button", onClick: () => {
                            const cur = currentSeconds;
                            seek(Math.min(effectiveDuration, cur + 4));
                        }, "aria-label": "Next phrase", children: "\u00BB" }), _jsxs("div", { style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            marginLeft: 'auto',
                        }, children: [_jsx("span", { style: { color: 'var(--color-muted)', fontSize: '0.85rem' }, children: "\uD83D\uDD0A" }), _jsx("input", { type: "range", className: "volume-range", min: 0, max: 100, defaultValue: 75, "aria-label": "Volume" })] })] }), _jsxs("div", { className: "position-range-wrap", children: [_jsx("input", { type: "range", className: "position-range", min: 0, max: effectiveDuration, step: 0.1, value: currentSeconds, onChange: (e) => seek(Number(e.target.value)), style: { width: '100%' }, "aria-label": "Position" }), _jsxs("div", { style: {
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: '0.8rem',
                            color: 'var(--color-muted)',
                            marginTop: '0.25rem',
                        }, children: [_jsx("span", { children: formatTime(currentSeconds) }), _jsx("span", { children: formatTime(effectiveDuration) })] })] })] }));
}
