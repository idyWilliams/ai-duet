# AI Duet — Milestone 0 + Milestone 1 Initialization Report

Generated: 2026-10-04

---

## 1. What Already Existed

Pre-existing spec artifacts in `.trae/specs/ai-duet-init/` (not committed into the repository docs tree; treated as the input instruction set for this initialization):

- `.trae/specs/ai-duet-init/spec.md` — Architecture & Repository Initialization (M0) functional/non-functional spec, 11 acceptance criteria (rule + rubric), 257 lines.
- `.trae/specs/ai-duet-init/tasks.md` — Implementation plan with 7 tasks (Task 1 = monorepo; Task 2 = 5 docs; Task 3 = TS interfaces; Task 4 = M1 classes; Task 5 = tests; Task 6 = this report; Task 7 = React UI shell).

The repository was otherwise empty before work began.

---

## 2. What I Created or Changed

### 2.1 Root-level configuration (monorepo scaffold)

- `/Users/mac/Documents/ai-duet/package.json` — Root workspace manifest, pnpm 9 + Node 20 engines, scripts: `build`, `test`, `typecheck` (all `pnpm -r …`). Root devDeps: `typescript ^5.7.0`, `vitest ^3.0.0`, `@types/node ^22.0.0`.
- `/Users/mac/Documents/ai-duet/pnpm-workspace.yaml` — Workspace globs: `packages/*`.
- `/Users/mac/Documents/ai-duet/tsconfig.base.json` — Root base TS config with `strict: true`, `noImplicitAny: true`, `strictNullChecks: true`, `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`, ESM `moduleResolution: bundler`.
- `/Users/mac/Documents/ai-duet/pnpm-lock.yaml` — Generated lockfile after install.
- `/Users/mac/Documents/ai-duet/.gitignore` — Ignores `node_modules/`, `dist/`, `*.tsbuildinfo`, Python `__pycache__/` and `.venv/`, IDE dirs.
- `/Users/mac/Documents/ai-duet/.npmrc` — Strict engine-strict, enables pnpm workspace linking defaults.

### 2.2 Documentation (5 core artifacts + this report)

- `/Users/mac/Documents/ai-duet/docs/PRODUCT_SPEC.md` — V1 product overview, users, user stories, phrase-turn model, headphones mandate, out-of-scope list.
- `/Users/mac/Documents/ai-duet/docs/ARCHITECTURE.md` — Layered architecture, package responsibilities, clock→score-follower→performance-engine→singing-engine→scheduler→mixer dataflow, look-ahead + commit-horizon design, cancellation/replanning, cached fallback triggers. Benchmark spec for singing-engine render-time-per-bar (N=20, 4-bar phrase 4/4@120, 48kHz mono 32f, p50/p95/p99, pass: p95 < 80% phrase duration).
- `/Users/mac/Documents/ai-duet/docs/AUDIO_ARCHITECTURE.md` — Main vs audio thread boundary, AudioWorklet comms rules, clock model (Seconds/Beat/Bar with branded types), beat/bar scheduling with 25ms tick + look-ahead + commit horizon, latency calibration procedure, Bluetooth drift limitations (40–150ms no timestamping → headphones required for prototype), 3-lane model (backing / human / AI vocal).
- `/Users/mac/Documents/ai-duet/docs/ENGINEERING_RULES.md` — 11 architectural invariants quoted verbatim; pnpm + pnpm-workspaces choice (vs npm workspaces, yarn berry, Turborepo/Nx) with justification; dependency approval log (one line per dep); typing/error handling/test/latency/content-licensing/UI-React sub-rules.
- `/Users/mac/Documents/ai-duet/docs/ROADMAP.md` — Milestones M0…M6+ with exact deliverable text per milestone. M2 = "backing-track lane + click track + latency calibration harness" (string matches spec verbatim).
- `/Users/mac/Documents/ai-duet/docs/INIT_REPORT.md` — This file (Task 6 deliverable).

### 2.3 Package: `@ai-duet/audio-core`

- `/Users/mac/Documents/ai-duet/packages/audio-core/package.json` — Lib manifest, scripts `build` (tsc to dist), `test` (vitest run), `typecheck` (tsc --noEmit). Deps: none. DevDeps: typescript, vitest, @types/node.
- `/Users/mac/Documents/ai-duet/packages/audio-core/tsconfig.json` — Extends root tsconfig.base.json; includes `src/**/*` + `__tests__/**/*`.
- `/Users/mac/Documents/ai-duet/packages/audio-core/vitest.config.ts` — Vitest node-environment config, globals true, `include: ['__tests__/**/*.test.ts']`, 10s test timeout.
- `/Users/mac/Documents/ai-duet/packages/audio-core/src/index.ts` — Central barrel re-exporting all public types, interfaces, classes.
- `/Users/mac/Documents/ai-duet/packages/audio-core/src/types/time.ts` — 5 branded opaque types: `SecondsTime`, `BeatTime`, `BarTime`, `AudioFrameTime`, `Confidence` (0..1); constructor helpers `seconds(n)`, `beat(n)`, `bar(n)`, `frame(n)`, `confidence(n)` with range checks.
- `/Users/mac/Documents/ai-duet/packages/audio-core/src/types/result.ts` — Discriminated `Result<T, E> = { ok:true, value:T } | { ok:false, error:E }` plus helpers `ok(v)`, `err(e)`.
- `/Users/mac/Documents/ai-duet/packages/audio-core/src/types/errors.ts` — Typed error subclasses: `AudioClockError extends Error`, `ScheduleError extends Error`.
- `/Users/mac/Documents/ai-duet/packages/audio-core/src/types/index.ts` — Barrel aggregating time/result/errors modules.
- `/Users/mac/Documents/ai-duet/packages/audio-core/src/clock/types.ts` — `IClock` interface (methods: `now`, `currentBeat`, `currentBar`, `beatToSeconds`, `secondsToBeat`, `setTempo`, `setTimeSignature`, `probeNow`). `ProbeReading` type (includes `wallClockReceivedAt` annotated for measurement-only use). Beat history record for piecewise-linear tempo/time-signature change accumulation.
- `/Users/mac/Documents/ai-duet/packages/audio-core/src/clock/AudioClock.ts` — Concrete `class AudioClock implements IClock`. Constructor takes `audioTimeProvider: () => number` (injectable for deterministic tests), plus start audio time, initial BPM, beats-per-bar, beat-unit. Tempo/time-signature changes are piecewise-linear effective-at-SecondsTime (old value before, new value at/after). No `Date.now` / `performance.now` used in scheduling math (probe's wall clock explicitly commented `// measurement only, never used for scheduling`).
- `/Users/mac/Documents/ai-duet/packages/audio-core/src/scheduler/types.ts` — `IBeatBarScheduler` interface (start/stop, onBeat/onBar listeners with RemoveFn return, cancelFuture). `BeatEvent`, `BarEvent` types including boolean `committed` field. RemoveFn alias.
- `/Users/mac/Documents/ai-duet/packages/audio-core/src/scheduler/BeatBarScheduler.ts` — Concrete `class BeatBarScheduler implements IBeatBarScheduler`. Holds `IClock` reference; uses configurable main-thread tick interval (default 25ms), lookAhead (default 100ms), commitHorizon (default 20ms). Events in `(now, now+commitHorizon]` marked committed and de-duplicated against a fired set; events in `(now+commitHorizon, now+lookAhead]` marked tentative. `cancelFuture(false)` removes tentative-only events; `cancelFuture(true)` attempts full removal but emits a typed warning for committed events and returns `Result.err<ScheduleError>`. Deterministic: identical clock provider sequence → identical emitted events.
- `/Users/mac/Documents/ai-duet/packages/audio-core/src/audio/types.ts` — `IAudioScheduler`, `IMixer`, `IBackingTrackLane`, `IAnalyzer`, `IScoreFollower` interfaces with typed scheduling handles, lane IDs, analyzer observations, score-position reports (songPositionSeconds / sectionId / phraseId / confidence).
- `/Users/mac/Documents/ai-duet/packages/audio-core/src/transport/types.ts` — `Turn = 'human' | 'ai'`; `PositionUpdate { seconds, isPlaying }`; `RemoveListener`; `TransportError` discriminated union (`NotImplemented` | `AudioContextUnavailable` | `SeekOutOfRange` with `max: SecondsTime`); `ITransport` interface (`play`, `pause`, `seek` all returning `Result`; `onPositionChange`, `onTurnChange` returning RemoveFn; `currentTurn`, `currentSeconds`, `isPlaying`, `startMockTicker`, `stopMockTicker`).
- `/Users/mac/Documents/ai-duet/packages/audio-core/src/transport/StubTransport.ts` — Concrete `StubTransport implements ITransport`. `play/pause/seek` all return `Result.err({ kind: 'NotImplemented', message: 'Transport audio not wired in M1' })` to satisfy AC-15(c) (explicitly unimplemented, not faked). Internal `MockTicker` (enabled via `startMockTicker(duration, intervalMs)` only when explicitly requested by consumer — it is NOT enabled by default — emits position/turn events via listeners so UI consumers can display a realistic progress bar and turn pill without React computing beat math).

Tests (audio-core):
- `/Users/mac/Documents/ai-duet/packages/audio-core/__tests__/AudioClock.test.ts` — 20 test cases covering: (5.1) 4/4@120 BPM happy-path beat/bar boundaries at T=0/0.5/1/2/4s; (5.2) tempo change 120→60 effective-at T=2s, assert beat at T=3s = 5.0; (5.3) time-signature change 4/4→3/4 at T=2s with bar-boundary alignment post-change; (5.4) branded round-trip beat↔seconds with 1e-9 tolerance; (5.5) probeNow consistency (`probe.audioTime === clock.now()`); plus edge cases (startTempo 0 clamp guard, negative seconds, beat-unit sub-1 values rejection, consecutive tempo change piecewise accumulation, idempotent setTempo same value no history push).
- `/Users/mac/Documents/ai-duet/packages/audio-core/__tests__/BeatBarScheduler.test.ts` — 15 test cases covering: (5.6) deterministic 5-second event sequence vs hand-computed (beatIndex, committed) list; (5.7) commit-horizon boundary classification (events ≤ now+40ms committed, ≤ now+200ms tentative only); (5.8) `cancelFuture(false)` removes tentative-only and leaves committed count unchanged; (5.9) `cancelFuture(true)` on state-with-committed returns `Result.err<ScheduleError>`; (5.10) idempotence: two runs with identical clock provider → deep-equal emitted event lists; plus edge cases (no-duplicate-firing of committed events across ticks, stop() halts emission, restart() resets fired set only past-now, empty lookAhead produces no events, tick interval 0 guard, listener removal idempotence).

### 2.4 Package: `@ai-duet/performance-engine`

- `/Users/mac/Documents/ai-duet/packages/performance-engine/package.json` — Lib manifest; scripts `build` (tsc to dist), `test` (`exit 0` — intentional noop, package exports interfaces-only in M0/M1 per task plan; no fake ML code permitted), `typecheck` (tsc --noEmit). Deps: `@ai-duet/audio-core workspace:*` (only allowed workspace dep per AC-2 direction rule). DevDeps: typescript, vitest, @types/node.
- `/Users/mac/Documents/ai-duet/packages/performance-engine/tsconfig.json` — Extends root tsconfig.base.json.
- `/Users/mac/Documents/ai-duet/packages/performance-engine/src/index.ts` — Barrel re-exports.
- `/Users/mac/Documents/ai-duet/packages/performance-engine/src/types/engine.ts` — `IPerformanceEngine` (tick → `{ tentativePlans, committedPlans }`), `ISingingEngine` (render with AbortSignal + timeoutMs → `Promise<Result<RenderedVocal, RenderError>>` with explicit RenderTimeout / RenderRejected / RenderQualityLow discriminated error arms each mapping to cached fallback selection), supporting types `PlanHorizon { lookAhead, commitHorizon }`, `PhraseTurn = 'human' | 'ai' | 'both'`, `RenderedVocal { buffer: Float32Array; sampleRate: 48000; phraseId; renderDurationMs }`, plus `Plan`, `RenderRequest`, `RenderError` discriminated unions.

### 2.5 Package: `@ai-duet/ml-experiments` (Python, independent)

- `/Users/mac/Documents/ai-duet/packages/ml-experiments/pyproject.toml` — PEP 517 project with hatchling build backend; Python requires `>=3.11`. Project name: `ai-duet-ml`. No runtime deps (intentionally zero — M0/M1 scaffold only).
- `/Users/mac/Documents/ai-duet/packages/ml-experiments/README.md` — Describes the package purpose: "Python/PyTorch home for singing-synthesis experiments, offline training scripts, score-follower alignment evaluation, and singing-engine benchmarking. Integrated with the TypeScript side via saved model artifacts (ONNX / TorchScript) loaded by a future @ai-duet/singing-runtime package; no TS-to-Python runtime bridge in M0."
- `/Users/mac/Documents/ai-duet/packages/ml-experiments/.gitignore` — Ignores `__pycache__/`, `.venv/`, `*.pyc`, `*.egg-info/`.
- `/Users/mac/Documents/ai-duet/packages/ml-experiments/src/ai_duet_ml/__init__.py` — Empty package init (scaffold only; no functional code committed).

### 2.6 Package: `@ai-duet/web-app` (Vite + React 18 + TS strict)

- `/Users/mac/Documents/ai-duet/packages/web-app/package.json` — App manifest. Scripts `dev` (vite), `build` (tsc -b && vite build), `preview` (vite preview), `typecheck` (tsc --noEmit), `test` (vitest jsdom). Runtime deps: `react ^18.3.1`, `react-dom ^18.3.1`, `react-router-dom ^6.28.0` (justified in ENGINEERING_RULES.md: standard minimal routing, URL shareability, weighed against a custom state-router), `@ai-duet/audio-core workspace:*`, `@ai-duet/performance-engine workspace:*` (imported but unused in M1, build-only placeholder for M4 integration). DevDeps: @types/react, @types/react-dom, @vitejs/plugin-react ^4.3.0, vite ^6.0.0, @testing-library/react, jsdom, @testing-library/jest-dom.
- `/Users/mac/Documents/ai-duet/packages/web-app/tsconfig.json` + `tsconfig.node.json` — Strict TS extending root base; DOM libs for JSX; Vite node config.
- `/Users/mac/Documents/ai-duet/packages/web-app/vite.config.ts` — Vite config with @vitejs/plugin-react, Vitest jsdom environment, globals: true, `include: ['__tests__/**/*.test.ts']` (audited — only `.test.ts` permitted, no `.test.tsx`, consistent with current test file).
- `/Users/mac/Documents/ai-duet/packages/web-app/index.html` — Vite entry HTML, mount point `#root`, charset + viewport set (for mobile responsiveness).
- `/Users/mac/Documents/ai-duet/packages/web-app/vite-env.d.ts` — Vite client reference types.
- `/Users/mac/Documents/ai-duet/packages/web-app/src/main.tsx` — React 18 `createRoot(...)` + `BrowserRouter` + `<App />` mount; StrictMode enabled.
- `/Users/mac/Documents/ai-duet/packages/web-app/src/App.tsx` — 3 client routes using `react-router-dom`: `/` → `Home`, `/song/:id` → `SongDetail`, `/play/:id` → `Player`. 404 is a redirect to `/`.
- `/Users/mac/Documents/ai-duet/packages/web-app/src/types.ts` — Shared `Song { id, title, artist, description, durationSec, accentHex }` type used by mock data and components.
- `/Users/mac/Documents/ai-duet/packages/web-app/src/data/mockSongs.ts` — Typed 3-song mock list (no copyrighted lyrics or melodies, no fetch/network):
  1. "Twilight Duet (Traditional, Public Domain Demo)"
  2. "Midnight Canon (Demo, Original Instrumental)"
  3. "Sunrise Line (Demo, Original)"
  Album artwork rendered via CSS `linear-gradient` background on a `<div>` (zero external image fetches).
- `/Users/mac/Documents/ai-duet/packages/web-app/src/audio/useTransport.ts` — React hook wrapping `StubTransport`. Single instance created outside React via module-level lazy init; hook subscribes to `onPositionChange` and `onTurnChange` with cleanup on unmount. Exposes: `positionSec`, `isPlaying`, `currentTurn`, `durationSec`, plus handlers `handlePlay`, `handlePause`, `handleToggle`, `handleSeek`, `handleSkipPhrase`. Progress and turn values always arrive via the typed subscription — the hook NEVER computes beat or turn math. Mock ticker explicitly started only when the Player page mounts (not globally) with `totalDuration = currentSong.durationSec` and `intervalMs = 500`.
- `/Users/mac/Documents/ai-duet/packages/web-app/src/components/SongCard.tsx` — Reusable artwork+title+artist card used in home featured row and all-songs list; click navigates to `/song/:id`. Art = gradient div (no network image).
- `/Users/mac/Documents/ai-duet/packages/web-app/src/pages/Home.tsx` — Home page `/`. Top search bar (controlled local React state, filters songs by title/artist substring — this is search state, NOT audio state). "Featured Songs" horizontal scrolling row (`.featured-row` flex with overflow-x-auto). "All Songs" vertical list with SongCard × duration. No waveforms, no engineering panels.
- `/Users/mac/Documents/ai-duet/packages/web-app/src/pages/SongDetail.tsx` — Song select + duet-mode picker `/song/:id`. Large album art, title, artist, description paragraph. 3 radio buttons under a `<fieldset>` for duet mode:
  1. "AI sings alternate lines" (default checked)
  2. "AI sings chorus"
  3. "AI sings harmony"
  Mode value stored in local React state `selectedMode` (UI-only, not an audio command). CTA "Start duet" button navigates to `/play/${id}?mode=${selectedMode}` using react-router-dom `<Link>`. No audio scheduling code.
- `/Users/mac/Documents/ai-duet/packages/web-app/src/pages/Player.tsx` — Duet player `/play/:id`. Layout adheres strictly to FR-6 consumer music-player aesthetic. Top row: back-link (←) left, song title center. Middle: large album-art square (gradient div, max 280px). Below art: one lyric line (mocked text, static for M1 — no waveform, no canvas, no SVG waveforms). Below lyrics: color-coded turn pill `You sing next` (teal `--color-accent-human: #14b8a6`) / `AI sings next` (magenta `--color-accent-ai: #ec4899`) with rounded pill shape 44px min-height for touch. Transport controls row: prev-phrase button (⏮) · large center play/pause (≥48px touch target, teal background) · next-phrase button (⏭) · volume range slider `<input type="range">` far right. Position bar below: `<input type="range">` bound to position from `onPositionChange` subscription only (React never increments it internally). No waveforms, no mixer panels, no fader banks, no audio-engine knob components, no `<canvas>` anywhere in the JSX tree.
- `/Users/mac/Documents/ai-duet/packages/web-app/src/index.css` — Global reset + dark consumer-music aesthetic using CSS custom properties (bg `#0b0b10`, surface `#17171f`, text `#f3f4f6`, human teal, AI magenta, muted `#9ca3af`). `.container` max-width 1100px centered. Featured row horizontal scroll, song cards with `gap: 1rem`, player controls with `align-items: center; justify-content: space-around`, turn pill font-weight 600 rounded-full, position + volume ranges with accent-color tokens. Mobile breakpoint: `@media (max-width: 480px)` collapses featured row padding, album art max-width 80vw, player controls gap shrink + wrap to 2 rows if viewport narrow, turn pill font 14px down from 16px, transport buttons min-height 44px preserved (touch target invariant enforced).

Tests (web-app):
- `/Users/mac/Documents/ai-duet/packages/web-app/__tests__/StubTransport.test.ts` — 5 jsdom test cases verifying AC-15(c) (singing/audio NOT faked, returns NotImplemented err): (a) `play()` → `Result.err.error.kind === 'NotImplemented'`, (b) `pause()` → same, (c) `seek(seconds(10))` → same, (d) `currentTurn()` starts `'human'`, (e) double-unsubscribe of listener is idempotent.

### 2.7 Files changed during final audit pass (Task 1 of this report run)

- `/Users/mac/Documents/ai-duet/packages/performance-engine/package.json` — `test` script changed from noisy echo-skip message to clean noop `exit 0` (consistent output, avoids contaminating CI logs).
- `/Users/mac/Documents/ai-duet/packages/web-app/vite.config.ts` — Vitest `include` trimmed to `['__tests__/**/*.test.ts']` only; removed the unused `__tests__/**/*.test.tsx` glob (no `.test.tsx` file exists in the package today; enforces test-file naming convention established by the one existing test `StubTransport.test.ts`).

---

## 3. Architecture Decisions

Each decision is linked to the doc section that contains its full justification.

1. **Package Manager: pnpm 9** — [ENGINEERING_RULES.md → Package Manager + Monorepo Tool Choice](file:///Users/mac/Documents/ai-duet/docs/ENGINEERING_RULES.md#L15-L28). Chosen over npm workspaces, yarn berry, Turborepo, Nx for strict symlink phantom-dep prevention (enforces dep direction), fastest installs, content-addressable store for disk efficiency, workspace: protocol + --filter ergonomics. Extra monorepo layer deferred to M3+.
2. **Monorepo Layout: 4 packages, 2 TS libs + 1 TS app + 1 Python scaffold** — [ARCHITECTURE.md → Package Responsibilities](file:///Users/mac/Documents/ai-duet/docs/ARCHITECTURE.md). Dependency direction strictly enforced: `audio-core` ← `performance-engine` ← `web-app`; `ml-experiments` independent.
3. **Test Runner: Vitest v3** — [ENGINEERING_RULES.md → Testing](file:///Users/mac/Documents/ai-duet/docs/ENGINEERING_RULES.md#L64-L69). Native ESM/TS, >2x faster than Jest cold, shares config with Vite in web-app, good Node/JSDOM dual-environment support.
4. **React Router: react-router-dom v6** — [ENGINEERING_RULES.md → Dependency Approval Log, web-app deps](file:///Users/mac/Documents/ai-duet/docs/ENGINEERING_RULES.md#L39-L44). Minimal standard client router weighed against in-app state-router; URL shareability + deep links win.
5. **Audio Time Authority: AudioContext.currentTime only; injectable time-provider pattern in AudioClock for deterministic tests** — [AUDIO_ARCHITECTURE.md → Clock Model](file:///Users/mac/Documents/ai-duet/docs/AUDIO_ARCHITECTURE.md) + architectural invariant #1 (verbatim in ENGINEERING_RULES.md #1).
6. **Time Math Type Discipline: Branded opaque SecondsTime/BeatTime/BarTime/Confidence** — [ENGINEERING_RULES.md → Typing Rules](file:///Users/mac/Documents/ai-duet/docs/ENGINEERING_RULES.md#L53-L57). Prevents accidental mixing of beat vs seconds vs confidence in arithmetic.
7. **Public Error Surface: Discriminated `Result<T, E>` union** — [ENGINEERING_RULES.md → Typing Rules + Error Handling](file:///Users/mac/Documents/ai-duet/docs/ENGINEERING_RULES.md#L53-L62). Only true internal panics throw typed subclasses (AudioClockError, ScheduleError).
8. **Beat/Bar Scheduling Architecture: look-ahead (100ms) + commit-horizon (20ms) + 25ms main-thread tick** — [AUDIO_ARCHITECTURE.md → Beat/Bar Scheduling](file:///Users/mac/Documents/ai-duet/docs/AUDIO_ARCHITECTURE.md) + [ARCHITECTURE.md → Look-Ahead and Commit Horizon](file:///Users/mac/Documents/ai-duet/docs/ARCHITECTURE.md). Committed events are immutable (Sample-accurate AudioWorklet posting deferred to M2; M1 scheduler events carry typed timestamps with committed flag only).
9. **Singing Engine Integration Strategy: Render-time benchmark + cached fallback on timeout/low-confidence** — [ARCHITECTURE.md → Singing-Engine Render-Time Benchmark Spec + Cached Fallback Triggers](file:///Users/mac/Documents/ai-duet/docs/ARCHITECTURE.md). Benchmark: 4-bar 4/4@120 BPM → 48kHz mono 32f; N=20; report p50/p95/p99; pass p95 < 80% phrase wall-clock time.
10. **Audio/UI Separation: React never computes beat/bar/turn; values always arrive via `onPositionChange` / `onTurnChange` subscriptions on `ITransport`** — [ENGINEERING_RULES.md → UI / React Rules](file:///Users/mac/Documents/ai-duet/docs/ENGINEERING_RULES.md#L81-L85). StubTransport.MockTicker, when explicitly started, emits the events; React just renders them.
11. **V1 Song Rights Strategy: No copyrighted lyrics/melodies/MIDI committed before M6 + documented LICENSE-THIRD-PARTY.md entry** — [ENGINEERING_RULES.md → Content Licensing Rule](file:///Users/mac/Documents/ai-duet/docs/ENGINEERING_RULES.md#L74-L79). M1 song list uses generic demo names and gradient-only artwork; zero networked image fetches, zero copyrighted assets.

---

## 4. Commands (Copy-Pasteable)

All commands run from repository root `/Users/mac/Documents/ai-duet`. Require Node ≥20 and pnpm 9.x (packageManager field in root package.json enforces). Python 3.11+ only if running ml-experiments Python side (not needed for TS build/test).

```bash
# 4.1 Install dependencies (uses frozen lockfile for reproducibility)
pnpm install --frozen-lockfile

# 4.2 Typecheck all 3 TS packages
pnpm typecheck

# 4.3 Build all 3 TS packages (tsc libs + vite app to dist/)
pnpm build

# 4.4 Run all tests (3 packages; performance-engine is a documented noop)
pnpm test

# 4.5 Per-package individual commands (use pnpm --filter for workspace isolation)
pnpm --filter @ai-duet/audio-core test          # run audio-core tests only
pnpm --filter @ai-duet/audio-core typecheck     # typecheck audio-core only
pnpm --filter @ai-duet/audio-core build         # build audio-core only

pnpm --filter @ai-duet/performance-engine build

pnpm --filter @ai-duet/web-app dev              # start Vite dev server at http://localhost:5173
pnpm --filter @ai-duet/web-app build            # production build → packages/web-app/dist
pnpm --filter @ai-duet/web-app preview          # preview production build
pnpm --filter @ai-duet/web-app test             # run web-app jsdom tests (StubTransport)
```

### 4.6 Manual M1 Determinism Harness (Node)

Instantiates `AudioClock` with a deterministic time provider and prints beat/bar progression. Saves pasting one-off Node snippets:

```bash
# (Optional) Run manual beat table against 4/4@120 0..5s:
node --experimental-strip-types -e "
const { AudioClock, seconds } = await import('./packages/audio-core/src/index.ts');
let t = 0;
const timeProvider = () => t;
const clock = new AudioClock(timeProvider, seconds(0), 120, 4, 4);
for (const step of [0, 0.25, 0.5, 1, 2, 3, 4, 5]) { t = step;
  console.log('T=' + t.toFixed(2), 's  beat=' + clock.currentBeat().toFixed(3), '  bar=' + clock.currentBar());
}"
```

### 4.7 Python (ml-experiments) scaffold validation (optional)

```bash
cd packages/ml-experiments
python3.11 -m venv .venv && source .venv/bin/activate
pip install -e . --quiet
python -c "import ai_duet_ml; print('OK: ai_duet_ml package importable')"
```

---

## 5. Test Results (Actual Command Output, No Fabrication)

### 5.1 `pnpm install --frozen-lockfile` — exit 0
```
Scope: all 4 workspace projects
Lockfile is up to date, resolution step is skipped
Already up to date
Done in 1.2s
```

### 5.2 `pnpm typecheck` — exit 0
```
> ai-duet@ typecheck /Users/mac/Documents/ai-duet
> pnpm -r typecheck

Scope: 3 of 4 workspace projects
packages/audio-core typecheck$ tsc --noEmit
└─ Done in 2.7s
packages/performance-engine typecheck$ tsc --noEmit
└─ Done in 1.5s
packages/web-app typecheck$ tsc --noEmit
└─ Done in 2.1s
```
✅ All 3 TS packages type-checked with strict mode. No `any` types (see Section 7 forensic grep).

### 5.3 `pnpm build` — exit 0
```
> ai-duet@ build /Users/mac/Documents/ai-duet
> pnpm -r build

Scope: 3 of 4 workspace projects
packages/audio-core build$ tsc -p tsconfig.json --noEmit false --outDir dist
└─ Done in 1.2s
packages/performance-engine build$ tsc -p tsconfig.json --noEmit false --outDir dist
└─ Done in 1s
packages/web-app build$ tsc -b && vite build
│ vite v6.4.3 building for production...
│ transforming...
│ ✓ 47 modules transformed.
│ rendering chunks...
│ computing gzip size...
│ dist/index.html                   0.39 kB │ gzip:  0.27 kB
│ dist/assets/index-CSMirCix.css    2.56 kB │ gzip:  0.97 kB
│ dist/assets/index-CGd8XF5b.js   178.19 kB │ gzip: 57.69 kB
│ ✓ built in 8.98s
└─ Done in 11.7s
```
✅ Vite production bundle: 47 modules, JS gzip 57.69 kB (no unexpected heavy deps; React + react-router-dom only).

### 5.4 `pnpm test` — exit 0
```
> ai-duet@ test /Users/mac/Documents/ai-duet
> pnpm -r test

Scope: 3 of 4 workspace projects
packages/audio-core test$ vitest run
│  RUN  v3.2.7 /Users/mac/Documents/ai-duet/packages/audio-core
│  ✓ __tests__/AudioClock.test.ts (20 tests) 8ms
│  ✓ __tests__/BeatBarScheduler.test.ts (15 tests) 93ms
│  Test Files  2 passed (2)
│       Tests  35 passed (35)
│    Start at  10:18:53
│    Duration  764ms
└─ Done in 2s
packages/performance-engine test$ exit 0
└─ Done in 11ms
packages/web-app test$ vitest
│  RUN  v3.2.7 /Users/mac/Documents/ai-duet/packages/web-app
│  ✓ __tests__/StubTransport.test.ts (5 tests) 5ms
│  Test Files  1 passed (1)
│       Tests  5 passed (5)
│    Start at  10:18:55
│    Duration  1.33s
└─ Done in 2.4s
```

Per-file summary:
| Package | Test File | Tests | Result |
|---|---|---|---|
| @ai-duet/audio-core | `__tests__/AudioClock.test.ts` | 20 | ✅ PASSED |
| @ai-duet/audio-core | `__tests__/BeatBarScheduler.test.ts` | 15 | ✅ PASSED |
| @ai-duet/performance-engine | (noop, interfaces-only M1) | — | ✅ exit 0 |
| @ai-duet/web-app | `__tests__/StubTransport.test.ts` | 5 | ✅ PASSED |
| **Total** | | **40** | **40 passed, 0 failed, 0 skipped** |

### 5.5 IDE Type Diagnostics (VS Code / tsserver)
✅ `GetDiagnostics` returned empty array `[]` — no open-file type/syntax errors across the workspace at audit time.

---

## 6. What Is Functional vs Mocked

### Functional (real code, exercised by passing tests)
- **Branded time-type constructors** (`seconds`, `beat`, `bar`, `frame`, `confidence`) with range + negation guards.
- **Result discriminated union** helpers `ok()`, `err()` — used on all public fallible APIs.
- **AudioClock beat/bar/time-signature math** including piecewise-linear tempo changes and time-signature changes effective at a SecondsTime boundary; 20 tests pass including round-trip conversions.
- **AudioClock IClock interface conformance**: `now()`, `currentBeat()`, `currentBar()`, `beatToSeconds()`, `secondsToBeat()`, `setTempo(..., effectiveAt)`, `setTimeSignature(..., effectiveAt)`, `probeNow()`.
- **BeatBarScheduler event dispatch + tentative/committed classification** using 25ms tick, 100ms lookAhead, 20ms commitHorizon (all configurable); 15 tests pass including cancellation semantics + idempotence + determinism.
- **Cancel policy**: `cancelFuture(false)` removes tentative only; `cancelFuture(true)` attempts force-removal and returns `Result.err(ScheduleError)` when committed events exist.
- **StubTransport listener plumbing** (subscribe/unsubscribe, idempotent unsubscribe, currentTurn default, NotImplemented returns).
- **React route tree** (3 pages, URL params, query-string mode).
- **React hook `useTransport` subscription** — positionSec, isPlaying, currentTurn values always flow from StubTransport listener callbacks, never from inline React math.
- **Mobile-responsive CSS layout** with 480px breakpoint and 44px touch targets preserved.
- **Vite production build** of web-app (47 modules, 57.69 kB gzip JS).

### Mocked / Unimplemented / Interfaces-Only
- **Singing Engine**: TypeScript interfaces `ISingingEngine`, `RenderError`, `RenderedVocal` only in `@ai-duet/performance-engine/src/types/engine.ts`. No concrete render implementation, no fake vocals, no pretend-ML (explicit per Non-Goals of spec). Test script = noop `exit 0`.
- **Performance Engine tick**: `IPerformanceEngine` interface only, no concrete class (M4 deliverable).
- **IAudioScheduler / IMixer / IBackingTrackLane / IAnalyzer / IScoreFollower**: Interfaces only in `@ai-duet/audio-core/src/audio/types.ts`; concrete implementations deferred to M2 (scheduler + mixer + backing lane) and M3 (score follower).
- **AudioWorklet code**: Not yet authored; M1 scheduler operates main-thread-only with typed AudioContext-aligned timestamps and committed flags (M2 step: post committed events to an AudioWorklet for sample accuracy).
- **ITransport audio playback**: `StubTransport.play/pause/seek` all return `Result.err({ kind: 'NotImplemented', message: 'Transport audio not wired in M1' })` — explicitly NOT faked (verified in StubTransport.test.ts assertions). Player UI cannot produce real audio in M1.
- **Mock ticker**: When Player mounts, it calls `startMockTicker(songDurationSec, 500)` to drive progress bar and turn pill display. The ticker lives in the StubTransport class outside React; it is progress-display-only and does NOT schedule audio.
- **Song data + lyrics + artwork**: 3 demo-song names in `mockSongs.ts` (no copyrighted assets); album artwork is CSS gradients only; lyric line in Player is the static placeholder string "Mock lyric line — demo only".
- **Headphone check UI / Bluetooth warning UI / latency calibration UI**: Not implemented (M6 items listed in ROADMAP.md); ENGINEERING_RULES and AUDIO_ARCHITECTURE document the requirement and Bluetooth drift caveat.
- **Python ml-experiments functional code**: `__init__.py` empty scaffold only; README explains purpose. No training, no Torch, no inference.
- **Microphone input, human-phrase capture, score alignment, any Web Audio graph creation**: None implemented.

---

## 7. Important Issues Still Needing Attention

1. **AudioWorklet integration missing (expected M2)**: `BeatBarScheduler` currently fires events on the main 25ms tick with typed committed timestamps, but does not post them to an AudioWorklet for sample-accurate buffering. Add AudioWorklet module + main-thread MessagePort bridge in M2.
2. **No real AudioContext wiring in web-app**: Clicking Play only returns NotImplemented; the next step (single next step, Section 9) wires the stub to real AudioClock + BeatBarScheduler to drive turn events still without buffer scheduling.
3. **No OfflineAudioContext / live-audio integration test harness today**: Tests use an injected deterministic time-provider closure (excellent for determinism) but there is no Node shim for WebAudio (`web-audio-engine` npm package evaluated: not added to keep dep footprint minimal; ENGINEERING_RULES allows adding it in M2 if the end-to-end loopback harness truly requires it).
4. **Coverage tooling not wired**: Vitest `@vitest/coverage-v8` is not yet in devDeps; NFR-3 ≥80% line coverage on lib packages is asserted manually by review (35 tests covering happy/tempo-change/time-sig-change/cancellation/determinism/roundtrip/error/edge) but not yet a CI-number. Add + justify `@vitest/coverage-v8` to ENGINEERING_RULES dep log when enabled.
5. **No song license procurement yet**: ROADMAP.md sets M6 for selection-of-one-licensed-or-public-domain song with a LICENSE-THIRD-PARTY.md entry. Start the license-confirmation process early in M3/M4 to avoid schedule slip at M6 release gate.
6. **Python ml-experiments has no deps and no scripts yet**: Intentional for M0, but M4/M5 will need to add `torch`, `torchaudio`, `numpy`, and `pytest` with a hatch environments config; this is a known clean-sheet state, not a bug.
7. **React Router dep: dep footprint is still small, but ROADMAP.md notes no HTTP framework, no auth — maintain the boundary; do NOT add `@tanstack/router`, `react-query`, axios, or fetch wrappers without ENGINEERING_RULES approval entries.**
8. **No headphone check UI, no Bluetooth-warning banner UI**: M6 UI items; AUDIO_ARCHITECTURE documents BT 40–150ms buffer drift; for prototype reliability require wired-3.5mm or USB-C headphones and show an explicit modal on first Play click when BT sink detected (M6).

---

## 8. Known Risks

Risks 1–7 from the spec's 7-category enumeration (each with mitigation sketch, repeated from docs for report completeness); risks 8–10 are implementation-phase additions.

1. **End-to-end latency budget** (AUDIO_ARCHITECTURE.md). Risk: human mic input → ADC → FFT/pitch → score-follower → perf-engine → sing-engine-render → scheduler → mixer → DAC → headphones can easily exceed the 100–150 ms budget needed for "feels in-time" duet. Mitigation: look-ahead window + commit-horizon (already designed), pre-render AI-phrase buffers during human turns, cache fallback vocal per phrase.
2. **Singing-synthesis render time vs look-ahead window** (ARCHITECTURE.md benchmark spec). Risk: commercial-grade DiffSinger / So-VITS family takes 300 ms–3 s per 4-bar phrase on CPU, blowing the 80% phrase-duration threshold. Mitigation: cached fallback vocal triggered on RenderTimeout/RenderQualityLow per `ISingingEngine.render` contract; benchmark strictly and choose a small distilled model.
3. **AudioWorklet ↔ main-thread communication overhead**. Risk: posting large Float32Arrays across the MessagePort every 10 ms causes GC pauses. Mitigation: transferable ArrayBuffers only; use SAB ring buffers when available (Chrome supports); cap post frequency to tick cadence.
4. **Bluetooth audio drift + no timestamps** (AUDIO_ARCHITECTURE.md). Risk: BT DAC buffers 40–150 ms variable, AudioContext.currentTime and actual speaker output diverge, causing human singer to feel "off" even when the graph is correct. Mitigation: first prototype REQUIRES wired headphones; M7 item uses the live mic signal + known backing-track reference for continuous drift compensation.
5. **Score follower confidence accuracy on real human singing**. Risk: casual singers (the product audience, not pros) pitch-shift, timing-slide, mumble words; offline DTW alignment against authored lyrics+melody might fall to confidence < 0.5 on many phrases, triggering cached fallback too often and feeling unresponsive. Mitigation: M3 uses one hand-authored offline-aligned song only; M5 adds per-phrase user calibration pass; degrade gracefully to turn-counting when confidence < threshold.
6. **Licensing / content rights for the V1 song** (ENGINEERING_RULES.md + PRODUCT_SPEC.md). Risk: shipping even 10-seconds of copyrighted commercial-song lyrics + melody without written permission → copyright liability. Mitigation: strict pre-commit gate in ENGINEERING_RULES.md; M6 deliverable requires docs/LICENSE-THIRD-PARTY.md entry. Start license procurement for a short public-domain folk song early.
7. **Web Audio / AudioWorklet on mobile browsers**. Risk: Safari iOS requires user-gesture to resume AudioContext; Android Chrome sometimes kills AudioWorklets in the background; mobile headphone jacks are increasingly rare. Mitigation: wrap AudioContext creation behind a user-gesture handler (M2 step); add a visible "Tap to start audio" overlay; document USB-C/lightning-headphones requirement; warn on Bluetooth.
8. **Deterministic-test-only gap**. Today's tests never touch a real AudioContext or a real audio device; M2 loopback calibration harness will close this by scheduling a click tone and recording the round-trip on the same device. Until then, "works on laptop audio jack" is a manual-test claim.
9. **Strict TS + exactOptionalPropertyTypes ergonomics for future contributors**. Exact-optional causes `{foo?: string}` to reject `{foo: undefined}` on assignment. This is deliberate (NFR-1) but often surprises developers used to lenient TS. Documented in ENGINEERING_RULES typing section; still, ensure future PRs include a short CONTRIBUTING hint (M2 README addition).
10. **React StrictMode double-mount + the singleton StubTransport pattern**. `useTransport` creates the transport via a module-level `let instance` lazy-init. StrictMode causes the hook to mount-unmount-mount during dev. The listener unsubscribe in the hook cleanup is idempotent (verified by StubTransport.test.ts case 5); however, the MockTicker's `startMockTicker` call in Player `useEffect([])` will be invoked twice in dev. Current code guard-checks `if (ticker) stopMockTicker()` before start — fine, but add a regression test in M2's web-app suite for this exact StrictMode behavior.

---

## 9. Single Next Implementation Step (One Concrete Sentence)

Wire the `StubTransport` class in `@ai-duet/audio-core/src/transport/StubTransport.ts` and the `useTransport` hook in `@ai-duet/web-app/src/audio/useTransport.ts` to a real `AudioContext` + `AudioClock` + `BeatBarScheduler` instantiation, so clicking the Play button actually starts the beat clock, the scheduler emits real beat/bar events with their correct committed timestamps, and the Player's turn pill reacts to the `onTurnChange` listener driven by beat-event phrasing — still with zero audio buffer scheduling and zero vocal rendering.

---

## 10. Next Milestone

**M2 = backing-track lane + click track + latency calibration harness.**

Detail copied verbatim from [ROADMAP.md](file:///Users/mac/Documents/ai-duet/docs/ROADMAP.md):

> **Milestone 2 (M2): Backing-track lane + click track + latency calibration harness.** Deliverables:
> 1. Concrete `IBackingTrackLane` implementation in `@ai-duet/audio-core` that loads an AudioBuffer (from a vendored public-domain click-track WAV or a generated short sine blip) and schedules it on the Mixer at exact SecondsTime boundaries driven by the BeatBarScheduler's committed bar events.
> 2. A built-in click track using a generated 880 Hz 10ms sine tone on beat 1 of every bar and a 440 Hz 5 ms tone on remaining beats; click is a lane on the mixer with its own volume (default –12 dBFS, user-togglable but not exposed in consumer UI until M3; available behind a `?dev=1` flag per ENGINEERING_RULES.md UI Rules).
> 3. `IMixer` concrete implementation: creates lanes with typed IDs, routes each lane's GainNode to the destination, supports ramped setVolume at a specified SecondsTime.
> 4. End-to-end latency calibration harness: a Node script (using a headless AudioContext OR a real-device manual page in web-app with ?dev=1) that plays a 1 kHz calibration tone out of the default output, captures it on the default input (loopback cable required OR a documented user-guided tap procedure), records the delta `(actualPlaybackObserved - scheduledAudioTime)`, and writes a JSON report with p50/p95 over N=20 trials. The calibration report's `outputLatencySec` field is consumed by AudioClock in a future M2a follow-up to offset scheduling and make BT drift at least measurable (compensation algorithm is M7).
> 5. `IAudioScheduler` concrete implementation (main-thread) that posts committed events to the same Mixer graph; introduces a ScheduleHandle and a `cancel()` contract that returns `false` for already-started buffers (layering on top of BeatBarScheduler's committed-is-immutable rule).
> 6. Tests: (a) Mixer lane creation + volume ramp; (b) click-track beat 1 / non-beat-1 classification; (c) BackingTrackLane scheduling determinism; (d) Calibration harness N=20 statistics match known-synthetic loopback input; (e) no `Date.now` / `performance.now` used for scheduling — probe/measurement only.
>
> Expected code delta in M2: +2 new classes (Mixer, BackingTrackLane) + 1 AudioContext-live integration test harness; no new runtime dependencies beyond what is already approved.
