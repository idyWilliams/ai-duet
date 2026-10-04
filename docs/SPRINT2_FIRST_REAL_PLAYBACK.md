# AI Duet — Sprint 2 Report: First Real Playback

Scope: Turn the existing music-app prototype into a genuinely playable audio
experience with a real Web Audio clock and a click/metronome track, while
preserving the normal consumer music-player UI (no DAW chrome).

Run on: 2026-10-04
Report author: Assistant (from `ai-duet-init` spec "Next Sprint: First Real
Playback").

---

## 0. Status

**Delivered.** Typecheck, tests, and production build all exit 0 on the
committed tree at `main` (worktree at `/Users/mac/Documents/ai-duet`). Manual
browser audibility verification is a HUMAN step and is documented in §4.4 as
not yet performed by automation.

---

## 1. Files changed

### 1.1 New files (2)

- `packages/audio-core/src/transport/ClickTrackTransport.ts`
  Real `ITransport` implementation. Constructor accepts optional injected
  `createAudioContext / createClock / createScheduler` for testability.
  Defaults: `AudioContext` resolved from `window.AudioContext ||
  window.webkitAudioContext` only inside `play()` (user-gesture-only),
  `new AudioClock(...)`, `new BeatBarScheduler(0.100, 0.020)`. Highlights:

  - Audio timeline authority: `AudioContext.currentTime` — never
    `Date.now` / `performance.now` (invariant from ENGINEERING_RULES.md §1).
  - Committed-beat-driven scheduling: `onBeat({ onlyCommitted: true })`
    calls `handleCommittedBeat(ev)` which maps musical scheduled time
    `ev.scheduledAtSeconds` onto the native timeline via the linear baseline
    `audioStartedAtCtxTime = ctx.currentTime - pauseCumulativeElapsed`.
  - Click rendering: short square-wave OscillatorNode → GainNode →
    destination. 880 Hz on beat 1 of the bar, 440 Hz on beats 2..N of a
    4/4 bar, 50 ms envelope with exponential attack + release.
  - State: Play → `ctx.resume()` + create clock + start scheduler + start
    33 ms position poller. Pause → `ctx.suspend()` + stop poller + kill
    scheduler + record `pauseCumulativeElapsed` so resume is drift-free.
    Seek → clamp to ≥ 0, remember `wasPlaying`, stop internals, overwrite
    baseline offset, restart play only if was playing. Stop → kill poller,
    scheduler `cancelFuture(false)` + `stop()`, all pending click nodes
    set gain → 0 and `stop(now + 0.01 s)`, `ctx.suspend()` then
    `ctx.close?.()`, drain listeners, reset turn/elapsed.
  - Turn switch: every 8 beats (TURN_SWITCH_PHRASE_BEATS = 8) flips
    `human → ai → human → ai…`.
  - Dev-facing APIs called only from the `?dev=1` Player panel:
    `setBpm(next)` clamped to `[40, 220]` and, if playing, restarts the
    scheduler via `seek(currentSeconds)` so the new tempo wins from the
    same elapsed marker. `setClickGainLinear(next)` clamped to `[0, 1]`,
    mutates live `_clickGainLinear` used on every next-scheduled click.

- `packages/audio-core/__tests__/ClickTrackTransport.test.ts` (11 cases)
  Injected-dependency tests under `vi.useFakeTimers()`. Fake AudioContext
  exposes `advanceSeconds(by)` / `jumpSeconds(to)` and records
  `createdOscs / createdGains` plus flags `wasSuspended / wasClosed`.
  Cases:

  1. `play() without AudioContext → err(kind=AudioContextUnavailable)`
  2. `play() with injected fake ctx → isPlaying true, position increases`.
  3. `pause()` idempotent, kills the position poller.
  4. `seek(-1)` clamps to 0, `seek(10)` honored.
  5. `stop()` idempotent, resets elapsed + turn to initial, restart play
     from 0 after stop.
  6. **Committed click frequencies**: 120 BPM 4/4 over 2.5 s, asserts ≥ 1
     beat-1 880 Hz click, ≥ 2× more 440 Hz other-beat clicks, all
     start/stop ordered and non-negative.
  7. **Pause-resume drift**: pause at t, resume, measured offset within
     ±0.2 s of original elapsed.
  8. **8-beat turn-switch cadence**: after 20 s at 120 BPM, turn history
     has at least two flips `human → ai → human`.
  9. **setBpm clamps 40..220** and, when playing, restarts scheduler so
     cadence actually changes.
 10. **setClickGainLinear clamps [0, 1]**.
 11. **stop() cleanup**: scheduler nulled, `wasSuspended && wasClosed`
     both true, pending click nodes empty.

### 1.2 Modified files (7)

- `packages/audio-core/src/transport/types.ts` — Added the mandatory
  contract `stop(): Result<void, TransportError>` to the top of
  `ITransport` (between `seek` and `onPositionChange`). Added
  `AudioContextUnavailable` kind to `TransportErrorKind`.
- `packages/audio-core/src/transport/StubTransport.ts` — Added `ok` to
  imports. Implemented new `stop()` contract: kills the mock ticker then
  drains both `positionListeners` and `turnListeners`, returns
  `ok(undefined)`.
- `packages/audio-core/src/index.ts` — Barrel export:
  `export * from './transport/ClickTrackTransport.js';`.
- `packages/web-app/src/audio/useTransport.ts` — Rewritten. Singleton is
  now `new ClickTrackTransport()` instead of `new StubTransport()`. The
  `useEffect` no longer calls `startMockTicker(duration, 500)` on mount
  (fixes the earlier "progress advances automatically with no audio"
  bug). Hook only subscribes position + turn listeners and unsubscribes
  them on cleanup. Returns `play() / pause() / seek()` as honest
  pass-through wrappers around the typed transport; added `clickTrack`
  return (transport cast to ClickTrackTransport) so `?dev=1` sliders can
  reach `setBpm / setClickGainLinear`.
- `packages/web-app/src/pages/Player.tsx` — Imported `useEffect /
  useState / useNavigate`. Added `isDevMode = searchParams.get('dev') ===
  '1'` guard. New cleanup `useEffect(keyed on song.id + transport +
  clickTrack)` runs `transport.stop()` on every unmount / song change
  (closes AudioContext, kills clicks). Added UI state: `bpm`,
  `clickGain`, `ctxState` probe string, `audioStateMsg` for the amber
  alert banner. Transport Play button onClick now wraps with guarded
  helpers `playWithAudioGuard()` / `pauseWithAudioGuard()` which translate
  any `Result.err` into the amber banner (specifically:
  `AudioContextUnavailable` tells the user they need to click and to
  check permissions). New DOM appended:
    - Role `alert` amber card when `audioStateMsg !== ''`.
    - `data-testid="dev-timing-diagnostics"` dashed-border card, rendered
      only when `isDevMode`. Contains BPM slider (40..220, live binds
      `clickTrack.setBpm`), click gain slider (0..1 linear, shown as 0–
      100%, binds `clickTrack.setClickGainLinear`), and a "Copy probe
      (state + elapsed)" button that runs `probeAudioNow()` and writes
      the monospace probe string to the right-hand column.
    - Muted, centered footer disclaimer:
      `Preview: audio click track only. No backing song, no AI voice, no mic.`
      This is the "clearly distinguish preview/mock behavior from real
      playback" marker from Step 2 of the sprint brief.
- `packages/web-app/__tests__/StubTransport.test.ts` — Expanded from 5 to
  8 cases. Added `vi.useFakeTimers()` setup and afterEach restorer.
  New: (6) `stop() returns ok / clears listeners / kills ticker so no
  further fires after stop`. (7) `double-stop idempotent`. (8)
  `startMockTicker→stopMockTicker leaves isPlaying false with zero fires
  after 2 s`.
- `packages/audio-core/src/transport/ClickTrackTransport.ts` constructor
  opts typing — post-first-typecheck cleanup. Replaced the broken
  `Required<Omit<ClickTrackTransportOpts, 'createAudioContext'> & Pick<…,
  'createAudioContext'>>` compound with an explicit `ResolvedOpts` type
  block and fixed the default createScheduler signature to accept a
  3rd tickIntervalMs argument as unused (to satisfy TS strict function
  assignability under `exactOptionalPropertyTypes`). Fixed the stray
  editor-inserted `void 0;` no-op line. Resolved TS2532 on
  ClickTrackTransport.test.ts:396 with a `!` non-null assertion after the
  `expect(scheduler).not.toBeNull()` check.

### 1.3 Preserved / intentionally untouched (contract)

- BeatBarScheduler and AudioClock are used as-is with zero source-code
  modifications — their committed-only beat events on a 25 ms cadence
  exactly match the canonical Web Audio "look-ahead" technique. No
  scheduler rewrite (satisfies the sprint's "smallest justified change"
  directive).
- Product UI shell: Home, SongDetail, App routing, SongCards, artwork,
  lyrics area, "You sing next / AI sings next" turn chip, song list
  mock data.
- Docs `PRODUCT_SPEC`, `ARCHITECTURE`, `AUDIO_ARCHITECTURE`,
  `ENGINEERING_RULES`, `ROADMAP`.
- No copyright lyrics / no copyrighted melodies / no backing song / no
  AI voice / no microphone APIs / no singing synthesis code anywhere in
  the committed tree (scope of Sprint 2 explicitly excludes them).

---

## 2. What a human can hear and do in the browser

Prerequisite: dev server running on `http://localhost:5173/` (see §4.2).
The procedure below is also the honest manual-audibility checklist and
must be performed by a human with working speakers or headphones —
automated DOM snapshots / unit tests **do not count** as proving audio is
audible.

1. **Open the Player directly with the dev gate enabled:**
   `http://localhost:5173/play/twilight?mode=alternate-lines&dev=1`
   Expected: You see artwork, title "Twilight Duet", lyrics placeholder
   phrase, turn chip "You sing next", progress slider reads 0:00, no
   auto-advance. A dashed-border "Developer-only timing diagnostics"
   card appears at the bottom of the Player with Tempo and Click gain
   sliders. Below everything, the small muted disclaimer text appears
   exactly:

   > Preview: audio click track only. No backing song, no AI voice, no mic.

2. **First click ▶ Play (must be a real trusted user gesture — programmatic
   dispatches count as untrusted by every browser for `resume()`).**
   Expected within 100 ms: an 880 Hz louder "tic" (beat-1) followed three
   times at a regular 600 ms cadence by a softer 440 Hz "toc", then back
   to a louder tic, etc., for a default 100 BPM × 4/4 metronome. Progress
   slider moves in small 33 ms increments; 0:00 count-up starts. Turn
   chip flips after 8 beats (≈ 4.8 s) to "AI sings next", then back to
   "You sing next" after another 8 beats.

3. **Click ❚❚ Pause.** Expected: clicks stop immediately. Progress freezes
   within one 33 ms poll frame. Press ▶ again → cadence resumes with a
   beat count that matches where you paused (no jump or drift).

4. **Drag the progress slider 10 s in, then release (or the equivalent
   range input commit).** Expected: clicks cut off, position jumps, new
   click cadence starts from the new beat immediately.

5. **Open the dev card and drag Tempo slider from 100 → 180.** Expected:
   within one scheduler tick (~25 ms) the cadence quickens to roughly 3
   clicks per second. Drag back to 60 → clicks slow to one per second.

6. **Drag Click gain from 25% → 0%.** Expected: the next scheduled click
   is silent (already-scheduled clicks are committed and play at old
   gain; see §5.6). Drag to 100% → next clicks are noticeably louder.

7. **Click Copy probe (state + elapsed).** Expected: the monospace probe
   text to the right updates with the transport state, BPM, elapsed
   seconds and AudioContext resume state (should read `running` while
   playing).

8. **Click Back link or the browser Back button → navigates to
   `/song/twilight` or `/`.** Expected: clicks stop instantly (within
   ~0.1 s of navigation commit). No clicks leak into the Home page.

**If any step above FAILS, attach: (a) browser + version, (b) OS, (c) any
DevTools console messages (warnings about user-gesture, AudioContext,
suspended/interrupted state), (d) whether the dev server has HMR lines
stuck (refresh the page once before reporting).**

---

## 3. What remains mocked

Everything in this list is explicitly out of Sprint 2's scope and will be
the subject of future milestones (see `ROADMAP.md` M3..M6):

- **No backing musical track** — only the click/metronome. No piano, no
  chords, no bass, no drums, no waveforms loaded from disk.
- **No AI vocal output** — no TTS, no neural singing synthesis, no
  pre-recorded AI voice samples, no copyright MIDI rendering of AI
  phrases.
- **No microphone input** — no `getUserMedia`, no pitch detection, no
  F0/CENTS scoring, no silence/VAD detection, no ASR of human singing.
- **Lyrics are static placeholders**. The turn chip flips every 8 beats
  but lyrics lines are not time-aligned to syllable markers against any
  score.
- **Song duration (3:00) is still mock meta data**, not the measured
  length of any decoded audio buffer. Stop resets to 0 regardless.

---

## 4. Actual test and build results (run verbatim)

All commands run with `$SHELL=bash`, `pnpm@9.x`, `node@20+`. Working
directory: `/Users/mac/Documents/ai-duet`.

### 4.1 pnpm typecheck

```text
> ai-duet@ typecheck /Users/mac/Documents/ai-duet
> pnpm -r typecheck

Scope: 3 of 4 workspace projects
packages/audio-core typecheck$ tsc --noEmit
│  (no errors)
packages/audio-core typecheck: Done
packages/performance-engine typecheck$ tsc --noEmit
│  (no errors)
packages/performance-engine typecheck: Done
packages/web-app typecheck$ tsc --noEmit
│  (no errors)
packages/web-app typecheck: Done

EXIT: 0
```

Notes on earlier typecheck run (exit 2) that was fixed before this final
snapshot:
- TS2375: `ResolvedOpts.createAudioContext` assignability — fixed by
  assigning the field through an explicit `if (opts.createAudioContext !==
  undefined)` guard instead of through the spread.
- TS2412: default createScheduler factory had a dead cast
  `.tickInterval = undefined` on `BeatBarScheduler` instance. Removed.
- TS2532 `test.ts:396`: expect matchers don't narrow for strict TS. Added
  explicit `!` non-null assertion after the `.not.toBeNull()` guard at
  both tick call sites.

### 4.2 pnpm test (Vitest v3.2.7)

```text
> ai-duet@ test /Users/mac/Documents/ai-duet
> pnpm -r test

Scope: 3 of 4 workspace projects

packages/audio-core test$ vitest run
  RUN  v3.2.7 /Users/mac/Documents/ai-duet/packages/audio-core
  ✓ __tests__/AudioClock.test.ts           (20 tests)   10 ms
  ✓ __tests__/ClickTrackTransport.test.ts  (11 tests)   24 ms
  ✓ __tests__/BeatBarScheduler.test.ts     (15 tests)   95 ms
  Test Files   3 passed (3)
       Tests  46 passed (46)

packages/performance-engine test$ exit 0
  (noop by design — interfaces only for M0/M1/M2)

packages/web-app test$ vitest run
  RUN  v3.2.7 /Users/mac/Documents/ai-duet/packages/web-app
  ✓ __tests__/StubTransport.test.ts        ( 8 tests)   11 ms
  Test Files   1 passed (1)
       Tests   8 passed (8)

GRAND TOTAL: 54 / 54 tests passed.
EXIT: 0
```

Previous baseline (INIT_REPORT.md) was 40 / 40 tests at the end of Sprint
1. Delta of +14: +11 ClickTrackTransport (new) + 3 StubTransport (extended
stop/ticker behavior).

### 4.3 pnpm build (production)

```text
> ai-duet@ build /Users/mac/Documents/ai-duet
> pnpm -r build

Scope: 3 of 4 workspace projects

packages/audio-core build$ tsc -p tsconfig.json --noEmit false --outDir dist
  Done in 1.9 s

packages/performance-engine build$ tsc -p tsconfig.json --noEmit false --outDir dist
  Done in 1.2 s

packages/web-app build$ tsc -b && vite build
  vite v6.4.3 building for production...
  transforming...
  ✓ 48 modules transformed.
  rendering chunks...
  computing gzip size...
  dist/index.html                    0.39 kB │ gzip:  0.27 kB
  dist/assets/index-CSMirCix.css     2.56 kB │ gzip:  0.97 kB
  dist/assets/index-CIOLLmbK.js    190.98 kB │ gzip: 61.35 kB
  ✓ built in 11.63 s
  Done in 14.4 s

EXIT: 0
```

No new npm dependencies were added. Bundle growth of JS gzip (61.35 kB)
is entirely accounted for by the new ClickTrackTransport logic, the
Player state hooks, and the dev-gated sliders + probe UI — acceptable for
the first real audio vertical slice.

### 4.4 Manual browser click-audibility verification (HONEST)

Performed by the assistant only to the extent possible from within the
sandbox (restrictions: no real trusted event dispatcher, no working audio
output device):

- ✅ Dev server verified running: `VITE v6.4.3 ready in 295 ms` on
  `http://localhost:5173/`.
- ✅ Player page `?dev=1` renders via browser snapshot + browser_evaluate
  probe: `window.AudioContext` API present, 4 range inputs (Volume +
  Position + Tempo + ClickGain), 4 buttons (Prev / Play / Next / Copy
  probe), element `[data-testid="dev-timing-diagnostics"]` present,
  muted preview disclaimer present, Position slider value `0` at mount
  (confirms Step-2 "no-auto-advance" rule).
- ⚠️ **Audible playback of clicks: NOT PERFORMED BY AUTOMATION.** — A
  human with working audio output must perform the 8-step procedure in
  §2 and mark the result as PASS / FAIL with per-step notes. The
  automated toolset has no speakers and cannot dispatch user-gesture-
  trusted events — any claim to the contrary would be dishonest.

---

## 5. Known timing and browser compatibility limitations

1. **Scheduler tick resolution**: BeatBarScheduler drives clicks via a
   25 ms main-thread tick with 100 ms look-ahead + 20 ms commit horizon.
   Audio itself is sample-accurate (osc.start(when) is on the audio
   thread), but React's progress slider updates only arrive every 33 ms.
   On a 120 Hz display, the progress bar may visually jitter one frame
   relative to a hardware-vsync compositor — audio is unaffected.
2. **Safari `close()` guard**: Safari < 15 did not ship `AudioContext.close()`.
   Our call is `ctx.close?.()`, so older Safari simply `suspend()`s the
   context on stop() and leaks one native AudioContext per session until
   tab close. Acceptable for M2; pooling of contexts is deferred to a
   later session-lifecycle sprint.
3. **User-gesture enforcement (all modern browsers)**: Programmatic
   `HTMLElement.click()` and synthetic `Event` dispatches are treated as
   untrusted. If `transport.play()` is invoked without a real trusted
   gesture preceding it, it returns `err(AudioContextUnavailable)`,
   which the Player surfaces as the amber `role="alert"` banner. This is
   by design — it exactly matches Step-3's "Create or resume
   AudioContext only in response to a user gesture" rule.
4. **Bluetooth headset currentTime drift**: Android/macOS Bluetooth
   stacks occasionally report `ctx.currentTime` offset by up to ~15 ms
   relative to wall clock because of codec buffer resampling. Click
   cadence is self-consistent (all clicks derived from ctx.currentTime)
   so this matters only when we later layer backing audio + need cross-
   reference to an external wall-clock source. Not a blocker now.
5. **iOS/OS X audio session interruptions**: A phone call, FaceTime, or
   Siri activation can put the AudioContext into `interrupted` state.
   Today we do not auto-resume; the user must press Play again. A
   session-recovery story is a later sprint.
6. **Click gain envelope only affects *next* scheduled clicks**: When
   playing, dragging the gain slider changes `_clickGainLinear` used by
   `scheduleClick`; click nodes already committed in the audio graph
   retain their old gain envelope. This is consistent with the
   AUDIO_ARCHITECTURE invariant that committed events are immutable and
   not cancelled once inside the commit horizon — audible in practice
   only if you thrash the slider within the 100 ms look-ahead window.
7. **No WebKit legacy `webkitAudioContext` test coverage**: Our fake
   AudioContext shim tests the modern path; legacy `webkitAudioContext`
   branch is exercised only by real Safari and is not separately under
   test. Mitigated by the fact the branch is a trivial 1-line fallback.

---

## 6. Next smallest step toward a real AI singing duet (M3 proposal)

Scope strictly bounded to one new vertical slice — no microphone, no
neural models, no copyrighted material. Name: **M3 Sprint 3: One real
human + one real AI turn segment with a royalty-free backing phrase.**

Do, in order:

1. Add `IBackedPhrase` to `@ai-duet/performance-engine`:
   ```ts
   export interface IBackedPhrase {
     role: 'human' | 'ai';
     startBeat: number;
     endBeat: number;
     sampleRate: 44100 | 48000;
     waveform: Float32Array;
     sourceLicense: /* 'cc0' | 'team-original' */ 'cc0' | 'team-original';
   }
   ```
   Keep typed; no ML, no copyright encumbrance.

2. Extend `ClickTrackTransport` (or create a `BackedPhraseTransport` that
   wraps it) with `scheduleBackedPhrase(IBackedPhrase):
   Result<void, TransportError>`. Internally uses
   `AudioBufferSourceNode.start(whenCtx, offsetInSamples/sampleRate)`
   triggered from inside a committed BeatEvent callback — **never** from
   React render. Honour cancel-before-commit semantics; after commit,
   leave scheduled nodes as immutable per AUDIO_ARCHITECTURE.

3. Commit two royalty-free, CC-0 or team-original, short (4 bar ≈ 8 s)
   assets under `packages/web-app/public/assets/backing/`:
   - `phrase-01-human-bpm100-keyC.ogg` — simple sustained piano, 100
     BPM, C-major, team-composed.
   - `phrase-02-ai-bpm100-keyC.ogg` — synthetic placeholder "AI" line
     (either `speechSynthesis.speak()` to an offline OfflineAudioContext
     capture, or team-created hummed melody); definitely NOT a
     copyrighted singer, NOT a TTS clone of any real person.
   Commit an accompanying `LICENSES.assets.md` in the same folder
   identifying authorship + license for both files. Copyrighted MIDI
   renditions or cover melodies are forbidden.

4. In Player.tsx: when a phrase backing is available for the active
   turn, call `scheduleBackedPhrase(...)` through the transport at Play
   or turn-switch time (still driven by transport's turn events — React
   never makes time decisions). Update lyric highlighting in React only
   in REACTION to turn-changes broadcast via `onTurnChange()`.

5. Add 3 unit tests with injected fake ctx + fake AudioBufferSourceNode
   recorder:
   a. `decodeAudioData failure → err(kind='BackingDecodeFailed')` with
      graceful fall-back to click-only.
   b. `stop()` detaches and stops all scheduled BufferSourceNodes (no
      leaks; no audio after stop).
   c. `pauseOffset` + resume → BufferSource resumes from correct offset
      within ±30 ms (tolerance for scheduler jitter).

6. Re-run §2 manual test procedure, replacing "click track only" with
   "click track + phrase backing", and add the new lines: "Step 9: On
   turn=human, hear phrase-01 piano backing alongside the tic-toc; Step
   10: On turn=ai, hear the AI placeholder hum; no audio overlap between
   phrase transitions beyond the 100 ms commit horizon."

Anything smaller than this (jumping straight to mic input, ML models, or
syllable-level alignment) skips the critical prerequisite question:
**"Can we actually schedule a real audio buffer with sample accuracy
inside our existing committed-beat transport?"** M3 Sprint 3 answers that
question with the smallest set of real-but-safe audio assets.

---
End of Sprint 2 report.
