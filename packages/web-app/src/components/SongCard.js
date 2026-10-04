import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useNavigate } from 'react-router-dom';
export default function SongCard({ song }) {
    const navigate = useNavigate();
    return (_jsxs("div", { className: "song-card", role: "button", tabIndex: 0, onClick: () => navigate(`/song/${song.id}`), onKeyDown: (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                navigate(`/song/${song.id}`);
            }
        }, children: [_jsx("div", { style: {
                    width: 140,
                    height: 140,
                    background: song.coverGradient,
                } }), _jsxs("div", { style: { padding: '0.75rem' }, children: [_jsx("div", { style: {
                            fontWeight: 600,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }, children: song.title }), _jsx("div", { style: {
                            fontSize: '0.875rem',
                            color: 'var(--color-muted)',
                            marginTop: '0.25rem',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }, children: song.artist })] })] }));
}
