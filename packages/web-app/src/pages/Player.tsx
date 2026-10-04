import { useMemo } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useTransport } from '../audio/useTransport';
import { SONGS } from '../data/mockSongs';
import type { Song, DuetMode } from '../types';
import { SecondsTime } from '@ai-duet/audio-core';

function mocklyricsBySeconds(secs: SecondsTime, _song: Song): string {
  const bucket = Math.floor((secs as number) / 4) % 6;
  if (bucket === 0) return 'When the evening falls so quiet';
  if (bucket === 1) return 'And the stars begin to climb';
  if (bucket === 2) return 'We will sing a song together';
  if (bucket === 3) return 'Voice to voice and line by line';
  if (bucket === 4) return 'Through the chorus and the verses';
  return 'Harmonizing one last time';
}

function formatMode(mode: DuetMode | null): string {
  if (mode === 'alternate-lines') return 'Alternate lines';
  if (mode === 'chorus-only') return 'Chorus only';
  if (mode === 'harmony') return 'Harmony';
  return 'Alternate lines';
}

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export default function Player() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const found = SONGS.find((s) => s.id === id);
  const fallback = SONGS[0];
  const song: Song = found ?? fallback ?? ({} as Song);
  const hasSong = found !== undefined || fallback !== undefined;
  const mode = (searchParams.get('mode') as DuetMode | null) ?? 'alternate-lines';

  const {
    currentSeconds,
    isPlaying,
    currentTurn,
    play,
    pause,
    seek,
    durationSeconds,
  } = useTransport();

  const effectiveDuration =
    hasSong && song.totalDurationSeconds > 0
      ? song.totalDurationSeconds
      : (durationSeconds as number);

  const lyricsLine = useMemo(() => {
    if (!hasSong) return '';
    return mocklyricsBySeconds(currentSeconds, song);
  }, [currentSeconds, song, hasSong]);

  const turnClass =
    currentTurn === 'human' ? 'turn-pill-human' : 'turn-pill-ai';
  const turnLabel =
    currentTurn === 'human' ? 'You sing next' : 'AI sings next';

  if (!hasSong) {
    return (
      <div className="container">
        <p>Song not found.</p>
        <Link to="/">← Back home</Link>
      </div>
    );
  }

  const songId = song.id;

  return (
    <div className="container">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.5rem 0 1rem',
          minHeight: 44,
        }}
      >
        <Link
          to={`/song/${songId}`}
          style={{
            color: 'var(--color-muted)',
            textDecoration: 'none',
            minWidth: 44,
            minHeight: 44,
            display: 'inline-flex',
            alignItems: 'center',
          }}
          aria-label="Back"
        >
          ←
        </Link>
        <div
          style={{
            flex: 1,
            textAlign: 'center',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontWeight: 600,
            padding: '0 0.5rem',
          }}
        >
          {song.title}
        </div>
        <div style={{ minWidth: 44 }} />
      </div>

      <div
        className="player-cover"
        style={{ background: song.coverGradient }}
      />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1rem 0.25rem 0',
          gap: '0.75rem',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: '1.15rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {song.title}
          </div>
          <div style={{ color: 'var(--color-muted)', fontSize: '0.9rem' }}>
            {song.artist}
          </div>
        </div>
        <div
          style={{
            flexShrink: 0,
            padding: '0.35rem 0.75rem',
            borderRadius: 9999,
            background: 'var(--color-surface)',
            fontSize: '0.8rem',
            fontWeight: 600,
          }}
        >
          {formatMode(mode)}
        </div>
      </div>

      <div className="lyrics-line">{lyricsLine}</div>

      <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
        <span className={`turn-pill ${turnClass}`}>{turnLabel}</span>
      </div>

      <div className="transport-row">
        <button
          className="skip-button"
          onClick={() => {
            const cur = currentSeconds as number;
            seek(Math.max(0, cur - 4));
          }}
          aria-label="Previous phrase"
        >
          «
        </button>
        <button
          className={`play-button ${isPlaying ? '' : 'paused'}`}
          onClick={() => {
            if (isPlaying) pause();
            else play();
          }}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '❚❚' : '▶'}
        </button>
        <button
          className="skip-button"
          onClick={() => {
            const cur = currentSeconds as number;
            seek(Math.min(effectiveDuration, cur + 4));
          }}
          aria-label="Next phrase"
        >
          »
        </button>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginLeft: 'auto',
          }}
        >
          <span style={{ color: 'var(--color-muted)', fontSize: '0.85rem' }}>
            🔊
          </span>
          <input
            type="range"
            className="volume-range"
            min={0}
            max={100}
            defaultValue={75}
            aria-label="Volume"
          />
        </div>
      </div>

      <div className="position-range-wrap">
        <input
          type="range"
          className="position-range"
          min={0}
          max={effectiveDuration}
          step={0.1}
          value={currentSeconds as number}
          onChange={(e) => seek(Number(e.target.value))}
          style={{ width: '100%' }}
          aria-label="Position"
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.8rem',
            color: 'var(--color-muted)',
            marginTop: '0.25rem',
          }}
        >
          <span>{formatTime(currentSeconds as number)}</span>
          <span>{formatTime(effectiveDuration)}</span>
        </div>
      </div>
    </div>
  );
}
