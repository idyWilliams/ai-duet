import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { SONGS } from '../data/mockSongs';
import SongCard from '../components/SongCard';
export default function Home() {
    const [query, setQuery] = useState('');
    const navigate = useNavigate();
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q)
            return SONGS;
        return SONGS.filter((s) => s.title.toLowerCase().includes(q) ||
            s.artist.toLowerCase().includes(q));
    }, [query]);
    return (_jsxs("div", { className: "container", children: [_jsx("header", { className: "home-header", children: _jsx("h1", { style: { margin: 0, fontSize: '1.75rem' }, children: "AI Duet" }) }), _jsx("div", { style: { padding: '0.5rem 0 1rem' }, children: _jsx("input", { type: "search", placeholder: "Search songs, artists\u2026", value: query, onChange: (e) => setQuery(e.target.value), style: {
                        width: '100%',
                        padding: '0.75rem 1rem',
                        borderRadius: 12,
                        border: '1px solid #27272a',
                        background: 'var(--color-surface)',
                        color: 'var(--color-text)',
                        fontSize: '1rem',
                        boxSizing: 'border-box',
                    } }) }), _jsxs("section", { style: { padding: '1rem 0' }, children: [_jsx("h2", { style: {
                            margin: 0,
                            fontSize: '1.25rem',
                            padding: '0.5rem 0',
                        }, children: "Featured Songs" }), _jsx("div", { className: "featured-row", children: SONGS.map((song) => (_jsx(SongCard, { song: song }, song.id))) })] }), _jsxs("section", { style: { padding: '1rem 0' }, children: [_jsx("h2", { style: {
                            margin: 0,
                            fontSize: '1.25rem',
                            padding: '0.5rem 0',
                        }, children: "All Songs" }), _jsxs("ul", { style: { listStyle: 'none', padding: 0, margin: 0 }, children: [filtered.map((song) => (_jsxs("li", { className: "song-list-row", role: "button", tabIndex: 0, onClick: () => navigate(`/song/${song.id}`), onKeyDown: (e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        navigate(`/song/${song.id}`);
                                    }
                                }, children: [_jsx("div", { style: {
                                            width: 48,
                                            height: 48,
                                            borderRadius: 8,
                                            background: song.coverGradient,
                                            flexShrink: 0,
                                        } }), _jsxs("div", { style: { minWidth: 0 }, children: [_jsx("div", { style: {
                                                    fontWeight: 600,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }, children: song.title }), _jsx("div", { style: {
                                                    fontSize: '0.875rem',
                                                    color: 'var(--color-muted)',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }, children: song.artist })] })] }, song.id))), filtered.length === 0 && (_jsxs("li", { style: {
                                    padding: '1rem',
                                    color: 'var(--color-muted)',
                                    textAlign: 'center',
                                }, children: ["No songs match \"", query, "\""] }))] })] })] }));
}
