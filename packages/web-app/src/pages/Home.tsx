import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { SONGS } from '../data/mockSongs';
import type { Song } from '../types';
import SongCard from '../components/SongCard';

export default function Home() {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SONGS;
    return SONGS.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <div className="container">
      <header className="home-header">
        <h1 style={{ margin: 0, fontSize: '1.75rem' }}>AI Duet</h1>
      </header>

      <div style={{ padding: '0.5rem 0 1rem' }}>
        <input
          type="search"
          placeholder="Search songs, artists…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '0.75rem 1rem',
            borderRadius: 12,
            border: '1px solid #27272a',
            background: 'var(--color-surface)',
            color: 'var(--color-text)',
            fontSize: '1rem',
            boxSizing: 'border-box',
          }}
        />
      </div>

      <section style={{ padding: '1rem 0' }}>
        <h2
          style={{
            margin: 0,
            fontSize: '1.25rem',
            padding: '0.5rem 0',
          }}
        >
          Featured Songs
        </h2>
        <div className="featured-row">
          {SONGS.map((song: Song) => (
            <SongCard key={song.id} song={song} />
          ))}
        </div>
      </section>

      <section style={{ padding: '1rem 0' }}>
        <h2
          style={{
            margin: 0,
            fontSize: '1.25rem',
            padding: '0.5rem 0',
          }}
        >
          All Songs
        </h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {filtered.map((song: Song) => (
            <li
              key={song.id}
              className="song-list-row"
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
                  width: 48,
                  height: 48,
                  borderRadius: 8,
                  background: song.coverGradient,
                  flexShrink: 0,
                }}
              />
              <div style={{ minWidth: 0 }}>
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
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {song.artist}
                </div>
              </div>
            </li>
          ))}
          {filtered.length === 0 && (
            <li
              style={{
                padding: '1rem',
                color: 'var(--color-muted)',
                textAlign: 'center',
              }}
            >
              No songs match "{query}"
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
