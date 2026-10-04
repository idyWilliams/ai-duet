import { useNavigate } from 'react-router-dom';
import type { Song } from '../types';

interface SongCardProps {
  song: Song;
}

export default function SongCard({ song }: SongCardProps) {
  const navigate = useNavigate();
  return (
    <div
      className="song-card"
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/song/${song.id}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(`/song/${song.id}`);
        }
      }}
    >
      <div
        style={{
          width: 140,
          height: 140,
          background: song.coverGradient,
        }}
      />
      <div style={{ padding: '0.75rem' }}>
        <div
          style={{
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {song.title}
        </div>
        <div
          style={{
            fontSize: '0.875rem',
            color: 'var(--color-muted)',
            marginTop: '0.25rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {song.artist}
        </div>
      </div>
    </div>
  );
}
