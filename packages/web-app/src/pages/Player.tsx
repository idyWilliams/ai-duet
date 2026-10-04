import { useMemo, useState, useEffect } from 'react';
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
  const found = SONGS.find((s) => s.id === id);
  const fallback = SONGS[0];
  const song: Song = found ?? fallback ?? ({} as Song);
  const hasSong = found !== undefined || fallback !== undefined;
  const mode = (searchParams.get('mode') as DuetMode | null) ?? 'alternate-lines';
  const isDevMode = searchParams.get('dev') === '1';

  const {
    currentSeconds,
    isPlaying,
    currentTurn,
    play,
    pause,
    seek,
    durationSeconds,
    clickTrack,
    transport,
  } = useTransport();

  const [bpm, setBpm] = useState<number>(clickTrack.currentBpm());
  const [clickGain, setClickGain] = useState<number>(
    clickTrack.currentClickGainLinear()
  );
  const [ctxState, setCtxState] = useState<string>('idle');
  const [audioStateMsg, setAudioStateMsg] = useState<string>('');

  useEffect(() => {
    let mounted = true;
    const t = window.setTimeout(() => {
      if (!mounted) return;
      setBpm(clickTrack.currentBpm());
      setClickGain(clickTrack.currentClickGainLinear());
    }, 0);
    return () => {
      mounted = false;
      window.clearTimeout(t);
      transport.stop();
    };
  }, [clickTrack, transport, song.id]);

  const applyDevBpm = (next: number): void => {
    const clamped = Math.max(40, Math.min(220, Math.round(next)));
    setBpm(clamped);
    const r = clickTrack.setBpm(clamped);
    if (r.ok === false) {
      setAudioStateMsg(`BPM: ${r.error.message}`);
    } else {
      setAudioStateMsg('');
    }
  };

  const applyClickGain = (next: number): void => {
    const clamped = Math.max(0, Math.min(1, next));
    setClickGain(clamped);
    clickTrack.setClickGainLinear(clamped);
  };

  const probeAudioNow = (): void => {
    const msg =
      `state=${isPlaying ? 'PLAYING' : 'PAUSED'} | bpm=${clickTrack.currentBpm()} | ` +
      `elapsed=${(currentSeconds as number).toFixed(3)}s | clickGain=${clickTrack.currentClickGainLinear().toFixed(2)}`;
    setCtxState(msg);
    window.navigator.clipboard?.writeText(msg).catch(() => undefined);
  };

  const playWithAudioGuard = (): void => {
    const r = play();
    if (r.ok === false) {
      if (r.error.kind === 'AudioContextUnavailable') {
        setAudioStateMsg(
          'Audio unavailable. Grant browser audio permissions and click the Play button (a user gesture is required).'
        );
      } else {
        setAudioStateMsg(`${r.error.kind}: ${r.error.message}`);
      }
      return;
    }
    setAudioStateMsg('');
  };

  const pauseWithAudioGuard = (): void => {
    const r = pause();
    if (r.ok === false) {
      setAudioStateMsg(`${r.error.kind}: ${r.error.message}`);
    }
  };

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
            if (isPlaying) pauseWithAudioGuard();
            else playWithAudioGuard();
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

      {audioStateMsg !== '' && (
        <div
          role="alert"
          style={{
            marginTop: '1rem',
            padding: '0.75rem 1rem',
            borderRadius: 12,
            border: '1px solid #7c2d12',
            background: '#431407',
            color: '#fed7aa',
            fontSize: '0.875rem',
            minHeight: 44,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {audioStateMsg}
        </div>
      )}

      {isDevMode && (
        <div
          data-testid="dev-timing-diagnostics"
          style={{
            marginTop: '1.5rem',
            padding: '1rem',
            borderRadius: 16,
            border: '1px dashed #44403c',
            background: '#1c1917',
          }}
        >
          <div
            style={{
              fontSize: '0.75rem',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: 'var(--color-muted)',
              fontWeight: 700,
              marginBottom: '0.75rem',
            }}
          >
            Developer-only timing diagnostics (hide by removing ?dev=1)
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', minHeight: 44 }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Tempo (BPM): {bpm}</span>
              <input
                type="range"
                min={40}
                max={220}
                step={1}
                value={bpm}
                onChange={(e) => applyDevBpm(Number(e.target.value))}
                style={{ width: '100%' }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', minHeight: 44 }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                Click gain: {(clickGain * 100).toFixed(0)}%
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={clickGain}
                onChange={(e) => applyClickGain(Number(e.target.value))}
                style={{ width: '100%' }}
              />
            </label>

            <div style={{ display: 'flex', gap: '0.5rem', minHeight: 44, alignItems: 'center' }}>
              <button
                onClick={probeAudioNow}
                style={{
                  minHeight: 44,
                  padding: '0.5rem 1rem',
                  borderRadius: 10,
                  border: '1px solid #44403c',
                  background: '#292524',
                  color: 'var(--color-text)',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Copy probe (state + elapsed)
              </button>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: '0.8rem',
                  color: 'var(--color-muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {ctxState}
              </span>
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          marginTop: '1rem',
          textAlign: 'center',
          fontSize: '0.75rem',
          color: 'var(--color-muted)',
        }}
      >
        Preview: audio click track only. No backing song, no AI voice, no mic.
      </div>
    </div>
  );
}
