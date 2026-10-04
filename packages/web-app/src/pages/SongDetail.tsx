import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { SONGS } from '../data/mockSongs';
import type { DuetMode } from '../types';

export default function SongDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const song = SONGS.find((s) => s.id === id);
  const [mode, setMode] = useState<DuetMode>('alternate-lines');

  if (!song) {
    return (
      <div className="container">
        <p>Song not found.</p>
        <Link to="/">← Back home</Link>
      </div>
    );
  }

  const modeOptions: { value: DuetMode; label: string }[] = [
    { value: 'alternate-lines', label: 'AI sings alternate lines' },
    { value: 'chorus-only', label: 'AI sings chorus' },
    { value: 'harmony', label: 'AI sings harmony' },
  ];

  return (
    <div className="container">
      <div style={{ padding: '0.5rem 0 1rem' }}>
        <Link
          to="/"
          style={{ color: 'var(--color-muted)', textDecoration: 'none' }}
        >
          ← Back home
        </Link>
      </div>

      <div
        style={{
          height: 220,
          width: '100%',
          borderRadius: 20,
          background: song.coverGradient,
        }}
      />

      <div style={{ padding: '1.25rem 0.25rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.75rem' }}>{song.title}</h1>
        <div style={{ color: 'var(--color-muted)', marginTop: '0.25rem' }}>
          {song.artist}
        </div>
        <p style={{ marginTop: '1rem', lineHeight: 1.6 }}>
          {song.description}
        </p>
      </div>

      <div style={{ padding: '0.5rem 0.25rem 1.5rem' }}>
        <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Choose duet mode</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
          {modeOptions.map((opt) => (
            <label
              key={opt.value}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.85rem 1rem',
                borderRadius: 12,
                background: 'var(--color-surface)',
                cursor: 'pointer',
                minHeight: 44,
                boxSizing: 'border-box',
              }}
            >
              <input
                type="radio"
                name="duet-mode"
                value={opt.value}
                checked={mode === opt.value}
                onChange={() => setMode(opt.value)}
                style={{ width: 18, height: 18 }}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      <button
        onClick={() => navigate(`/play/${song.id}?mode=${mode}`)}
        style={{
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
        }}
      >
        Start duet →
      </button>
    </div>
  );
}
