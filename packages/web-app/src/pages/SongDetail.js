import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { SONGS } from '../data/mockSongs';
export default function SongDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const song = SONGS.find((s) => s.id === id);
    const [mode, setMode] = useState('alternate-lines');
    if (!song) {
        return (_jsxs("div", { className: "container", children: [_jsx("p", { children: "Song not found." }), _jsx(Link, { to: "/", children: "\u2190 Back home" })] }));
    }
    const modeOptions = [
        { value: 'alternate-lines', label: 'AI sings alternate lines' },
        { value: 'chorus-only', label: 'AI sings chorus' },
        { value: 'harmony', label: 'AI sings harmony' },
    ];
    return (_jsxs("div", { className: "container", children: [_jsx("div", { style: { padding: '0.5rem 0 1rem' }, children: _jsx(Link, { to: "/", style: { color: 'var(--color-muted)', textDecoration: 'none' }, children: "\u2190 Back home" }) }), _jsx("div", { style: {
                    height: 220,
                    width: '100%',
                    borderRadius: 20,
                    background: song.coverGradient,
                } }), _jsxs("div", { style: { padding: '1.25rem 0.25rem' }, children: [_jsx("h1", { style: { margin: 0, fontSize: '1.75rem' }, children: song.title }), _jsx("div", { style: { color: 'var(--color-muted)', marginTop: '0.25rem' }, children: song.artist }), _jsx("p", { style: { marginTop: '1rem', lineHeight: 1.6 }, children: song.description })] }), _jsxs("div", { style: { padding: '0.5rem 0.25rem 1.5rem' }, children: [_jsx("h2", { style: { fontSize: '1.1rem', margin: 0 }, children: "Choose duet mode" }), _jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }, children: modeOptions.map((opt) => (_jsxs("label", { style: {
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                padding: '0.85rem 1rem',
                                borderRadius: 12,
                                background: 'var(--color-surface)',
                                cursor: 'pointer',
                                minHeight: 44,
                                boxSizing: 'border-box',
                            }, children: [_jsx("input", { type: "radio", name: "duet-mode", value: opt.value, checked: mode === opt.value, onChange: () => setMode(opt.value), style: { width: 18, height: 18 } }), _jsx("span", { children: opt.label })] }, opt.value))) })] }), _jsx("button", { onClick: () => navigate(`/play/${song.id}?mode=${mode}`), style: {
                    width: '100%',
                    minHeight: 52,
                    padding: '0.85rem 1.25rem',
                    borderRadius: 14,
                    border: 'none',
                    background: 'var(--color-accent-human)',
                    color: '#052e2b',
                    fontSize: '1.05rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                }, children: "Start duet \u2192" })] }));
}
