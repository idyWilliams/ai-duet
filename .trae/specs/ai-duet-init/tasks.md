# AI Duet - Architecture & Repository Initialization (Milestone 0) - Implementation Plan

## Task 1: Initialize monorepo with chosen package manager + 4 package stubs
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Choose package manager (pnpm) and monorepo tool (pnpm workspaces, no additional monorepo-layer like Turborepo/Nx at this stage — defer until M3+ if build graphs get heavy).
  - Write root `package.json`, `pnpm-workspace.yaml`, root `tsconfig.base.json`, root `.gitignore`, root `.npmrc` (strict engine).
  - Create 4 packages with manifests: `packages/audio-core`, `packages/performance-engine`, `packages/web-app`, `packages/ml-experiments` (Python).
  - Justify pnpm choice in the dependency log (to be written into ENGINEERING_RULES in Task 2) over npm + workspaces and yarn + workspaces.
  - Keep `web-app` as minimal React+TS scaffold (Vite) but with only an empty `App.tsx` — no UI components.
  - Keep `ml-experiments` as a Python 3.11 project with `pyproject.toml`, a `README.md` describing its purpose, and a placeholder `src/ai_duet_ml/__init__.py` — no functional code.
  - Add TypeScript ^5 and Vitest as dev deps at root; justify each dep in ENGINEERING_RULES dependency log.
- **Acceptance Criteria Addressed**: AC-2, AC-7, AC-10
- **Test Requirements**:
  - `rule` TR-1.1: Root directory contains `pnpm-workspace.yaml` listing `packages/*` and a root `package.json` with `workspaces`-compatible PM; `packages/audio-core/package.json`, `packages/performance-engine/package.json`, `packages/web-app/package.json`, and `packages/ml-experiments/pyproject.toml` all exist. Evidence: `find packages -maxdepth 2 \( -name package.json -o -name pyproject.toml \)` output and `cat pnpm-workspace.yaml`.
  - `rule` TR-1.2: Dependency direction enforced: `audio-core/package.json` has no `@ai-duet/performance-engine` or `@ai-duet/web-app` deps; `performance-engine/package.json` may depend only on `@ai-duet/audio-core` among workspace packages; `web-app/package.json` may depend on both. Evidence: concatenated dependency sections from the three TS package.json files.
  - `rule` TR-1.3: Forbidden deps scan: `packages/*/package.json` dependency/devDependencies do not include `express`, `koa`, `postgres`, `pg`, `mongodb`, `mongoose`, `mongoose`, `firebase`, `auth0`, `passport`, `prisma`, `typeorm`, `axios`, `tensorflow`, `onnxruntime-web` (synthesis deps allowed only in ml-experiments Python side, not in TS packages). Evidence: `jq -r '.dependencies,.devDependencies // {} | keys | .[]' packages/*/package.json | sort -u` manual review.
  - `rubric` TR-1.4: Minimalism of scaffold; scale 1-5; anchors 1 = 50+ total deps, 3 = moderate bloat, 5 = absolute minimum to build + test TS packages and Python scaffold; threshold >= 4. Evidence: `pnpm ls -r --depth 0` count + manual review of pyproject.toml deps.
- **Notes**: pnpm chosen for: (a) strict package boundaries and symlink isolation preventing phantom deps (critical for dependency direction rules), (b) fastest install speed vs npm/yarn, (c) disk efficiency via content-addressable store (important if future Torch deps become large), (d) excellent TS monorepo ergonomics with workspace: protocol. Turborepo/Nx deferred: M0/M1 build graphs are trivial (2 TS libs + 1 shell app); cost of an extra orchestration layer outweighs benefit until caching across > 4 build tasks in CI is required. Python uses plain venv + pip + pyproject.toml with `hatchling` build backend; uv/poetry avoided for M0 to keep toolchain minimal (one package manager discipline: pnpm for JS, pip + venv for Python).

## Task 2: Author five core documentation artifacts
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 1 (so that the dependency log in ENGINEERING_RULES.md can reference actual package names/deps)
- **Description**:
  - Create `docs/PRODUCT_SPEC.md`: V1 overview; target users (casual singers, karaoke hobbyists, bedroom producers); user stories (3 minimum: "warm up to a duet," "practice a new song line-by-line," "perform for a friend with AI backup"); phrase turn model (Human phrase p → AI phrase a → Human, alternating, configurable per-score); headphones mandatory; out-of-scope list (free improv, auto-song-rec, multi-singer, duet over network).
  - Create `docs/ARCHITECTURE.md`: Layered diagram (as text bullets); package responsibilities; data-flow pipeline: Clock emits beat/bar/audio-time → Score Follower reports pos/section/phrase/confidence → Performance Engine consumes clock + score position + lyrics + melody + confidence and produces tentative plans (mutable, cancellable inside look-ahead but outside commit horizon) + committed plans (frozen, at or inside commit horizon) → Singing Engine renders committed plan to audio (or returns cached fallback) → Audio Scheduler enqueues rendered audio onto Mixer lanes at exact AudioContext times → Mixer sums backing/human/AI lanes to output. Explicit sections: look-ahead window, commit horizon, plan cancellation/replanning, cached fallback triggers (confidence < threshold, render timeout, render error).
  - Create `docs/AUDIO_ARCHITECTURE.md`: Main-thread vs audio-thread boundary; AudioWorklet message ports as the only audio-thread communication; strict rule: AudioWorklet processor never does fetch/XHR, never runs neural inference. Clock model: Seconds = AudioContext.currentTime, BeatTime = (seconds - startSeconds) * bpm/60, BarTime = floor(BeatTime / beatsPerBar). Time-signature aware. Beat/bar scheduling uses look-ahead scan every 25ms main-thread tick; events <= commit-horizon become immutable and get posted to the AudioWorklet for sample-accurate scheduling. Latency calibration: measure output round-trip with a loopback tone + click (documented procedure). Bluetooth limitations: BT buffer 40–150ms, variable, no timestamping, so drift relative to AudioContext.currentTime is expected; first prototype REQUIRES wired headphones; BT will be explicitly warned against in UI (future work: drift compensation using the live mic signal and a known backing-track reference). Input/output: audio lane model — backing lane (pre-rendered, immutable), human lane (live input monitored, not rendered back to avoid feedback without headphones), AI vocal lane (rendered buffers scheduled).
  - Create `docs/ENGINEERING_RULES.md`: (1) Quote all 11 architectural invariants verbatim. (2) Package manager and monorepo tool choice section (pnpm + pnpm workspaces; compare to npm workspaces, yarn workspaces, Turborepo, Nx). (3) Dependency approval log: every added dep (including dev deps) listed with one-line justification (e.g., "typescript ^5: required for strict TS builds per NFR-1"). (4) Typing rules: strict mode on everywhere, no `any`, prefer branded types for time units, `Result<T,E>` discriminated union for public APIs that may fail. (5) Error handling: typed error classes per domain (ClockError, ScheduleError, RenderError, ScoreError); never silent catches; main-thread error boundary + AudioWorklet error-on-message port. (6) Testing: Vitest per package; M1+ must include latency measurement hooks (probes in IClock) and determinism tests; coverage target >= 80% on lib packages; forbidden: snapshot tests for audio math (use numerical tolerance). (7) Latency measurement: IClock exposes `probeNow(): { audioTime, beat, bar, wallClockReceivedAt }`; scheduler logs `(scheduledAudioTime, actualProcessIteration, delta)`; budget per doc. (8) Content licensing: no copyrighted lyrics/melodies committed without a LICENSE-THIRD-PARTY.md entry; one canonical public-domain example song is selected and named in ROADMAP M6.
  - Create `docs/ROADMAP.md**: M0 = this work (architecture + docs + M1 scaffold); M1 = audio clock + deterministic beat/bar scheduler + tests (the code part of this implementation plan); M2 = backing-track lane + click track + latency calibration harness; M3 = score follower for one authored score (one pre-selected song, offline alignment against known lyrics/melody); M4 = performance engine with look-ahead, commit horizon, tentative-to-committed transition, cancellation/replanning, cached fallback selection logic; M5 = singing engine integration with a real TTS/singing-synthesis backend, fallback cache, with benchmark; M6 = React UI (human phrase capture, turn indicator, turn countdown, latency calibration UI, headphone check UI, Bluetooth warning) + end-to-end demo with one licensed/public-domain song. After M6 = M7+ free improvisation, auto song rec, multi-user network duet, BT drift compensation.
- **Acceptance Criteria Addressed**: AC-1, AC-4, AC-7, AC-9, AC-12
- **Test Requirements**:
  - `rule` TR-2.1: All 5 files exist with required section headings. Evidence: `ls docs/` and per-file `grep` for the section headings enumerated in FR-2.
  - `rule` TR-2.2: ENGINEERING_RULES.md contains each of the 11 architectural invariants exactly as stated in the spec. Evidence: `diff` output of the 11 invariants text against the source user-request text (or manual line-by-line match count).
  - `rule` TR-2.3: ENGINEERING_RULES.md contains a "Dependency Approval Log" section listing every root/package.json dep with one-line justification. Evidence: doc section content.
  - `rule` TR-2.4: Risks enumerated with >= 7 distinct entries covering each FR-4 category (latency budget, render time, worklet comms, BT drift, score follower confidence, licensing, mobile browser support); each risk has a brief mitigation sketch. Evidence: risk list in doc.
  - `rule` TR-2.5: Benchmark section in docs (ARCHITECTURE.md or AUDIO_ARCHITECTURE.md) stating N=20, metric = wall time from request to RenderedVocal buffer available (4-bar phrase, 4/4, 120 BPM, 48kHz mono 32-bit float), p50/p95/p99 reporting, pass threshold p95 < 0.80 * (phrase_duration). Evidence: the literal text in the corresponding doc.
  - `rubric` TR-2.6: Documentation coherence; scale 1-5; anchors 1 = stubs with placeholders, 3 = filled but inconsistent cross-references, 5 = all sections complete, cross-docs references consistent (e.g., milestone numbers match, package names match Task 1), an engineer new to the repo can start M2 without asking questions; threshold >= 4. Evidence: manual review.

## Task 3: Define core TypeScript interfaces in audio-core and performance-engine
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - In `packages/audio-core/src/index.ts` + submodules:
    - Branded types: `export type SecondsTime = number & { readonly __tag: unique symbol };`, similar for `BeatTime`, `BarTime`, `AudioFrameTime`, `Confidence` (0..1).
    - `IClock`: methods `now(): SecondsTime`, `currentBeat(): BeatTime`, `currentBar(): BarTime`, `beatToSeconds(b: BeatTime): SecondsTime`, `secondsToBeat(s: SecondsTime): BeatTime`, `setTempo(bpm: number, effectiveAt: SecondsTime): void`, `setTimeSignature(beatsPerBar: number, beatUnit: number, effectiveAt: SecondsTime): void`, `probeNow(): ProbeReading` (ProbeReading includes audioTime, beat, bar, and a wall-clock receipt time for measurement purposes only; wall clock is NOT used for scheduling math).
    - `IBeatBarScheduler`: `start(clock: IClock): void`, `stop(): void`, `onBeat(listener: (e: BeatEvent) => void): RemoveFn`, `onBar(listener: (e: BarEvent) => void): RemoveFn`, `cancelFuture(olderThanHorizon: boolean): void`, with `BeatEvent = { beat: BeatTime, scheduledAt: SecondsTime, committed: boolean }` and `BarEvent = { bar: BarTime, scheduledAt: SecondsTime, committed: boolean }`.
    - `IAudioScheduler`: `scheduleBuffer(buffer: AudioBuffer, at: SecondsTime, laneId: LaneId): ScheduleHandle`, `cancel(handle: ScheduleHandle): boolean`, `getLookAhead(): SecondsTime`, `getCommitHorizon(): SecondsTime`.
    - `IMixer`: `createLane(id: LaneId, opts: LaneOpts): Lane`, `setVolume(laneId: LaneId, vol: number, rampAt: SecondsTime): void`, `connectToDestination(): void`.
    - `IBackingTrackLane`: `load(url: string): Promise<void>`, `startAt(at: SecondsTime): void`, `stop(): void`.
    - `IAnalyzer`: `processChunk(chunk: Float32Array, at: SecondsTime): AnalyzerObservation[]` (pure, no side-effect scheduling).
    - `IScoreFollower`: `feed(obs: AnalyzerObservation[], clockNow: SecondsTime): ScorePositionReport`, where `ScorePositionReport = { songPositionSeconds: SecondsTime, sectionId: string, phraseId: string, confidence: Confidence }`.
  - In `packages/performance-engine/src/index.ts` + submodules:
    - `IPerformanceEngine`: `tick(clockState, scoreReport, scoreLibrary): EngineOutput`, where `EngineOutput = { tentativePlans: Plan[], committedPlans: Plan[] }`.
    - `ISingingEngine`: `render(req: RenderRequest, abortSignal: AbortSignal, timeoutMs: number): Promise<Result<RenderedVocal, RenderError>>`. Explicit failure modes: RenderTimeout, RenderRejected, RenderQualityLow — each maps to cached fallback selection.
    - Supporting types: `PlanHorizon = { lookAhead: SecondsTime, commitHorizon: SecondsTime }`, `PhraseTurn = 'human' | 'ai' | 'both'`, `RenderedVocal = { buffer: Float32Array /* 48kHz mono */, sampleRate: 48000, phraseId: string, renderDurationMs: number }`, `Plan`, `RenderRequest`, `RenderError` (discriminated union of specific types).
  - Ensure zero `: any` usage. Use `unknown` with type guard where truly generic. Use exported `Result<T, E>` type from a shared `utils.ts` submodule in `audio-core` (Result = discriminated union `{ ok: true, value: T } | { ok: false, error: E }`).
  - Strict tsconfig per package extending root base.
- **Acceptance Criteria Addressed**: AC-3, AC-11
- **Test Requirements**:
  - `rule` TR-3.1: `tsc --noEmit -p packages/audio-core` succeeds; same for `performance-engine`. Evidence: command output (exit 0).
  - `rule` TR-3.2: A smoke test (`packages/audio-core/__tests__/interfaces-export.test.ts`) imports all 7 interfaces (IClock, IBeatBarScheduler, IAudioScheduler, IMixer, IBackingTrackLane, IAnalyzer, IScoreFollower) and 5 branded types; similarly for performance-engine's 6 symbols; TS compiles the test. Evidence: test file exists and `vitest run interfaces-export` passes or is run without TS errors.
  - `rule` TR-3.3: `grep -rn ":[[:space:]]*any" packages/audio-core/src packages/performance-engine/src` returns zero matches. Evidence: grep empty output.
  - `rule` TR-3.4: Each package tsconfig.json extends the root tsconfig.base.json and sets `strict: true`, `noImplicitAny: true`, `strictNullChecks: true`, `exactOptionalPropertyTypes: true`. Evidence: concatenated tsconfig.json content.
  - `rubric` TR-3.5: Interface minimality and boundary correctness; scale 1-5; anchors 1 = interfaces expose internal state/classes, 3 = interfaces OK but some methods are leaky, 5 = behavior-only, no implementation types leak, parameter/return types use branded time units everywhere; threshold >= 4. Evidence: manual code review.

## Task 4: Implement M1 AudioClock and BeatBarScheduler
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 3
- **Description**:
  - `AudioClock` class in `packages/audio-core/src/clock/AudioClock.ts`: constructor takes (audioTimeProvider: () => number, startAudioTime: SecondsTime, initialBpm: number, beatsPerBar: number, beatUnit: number). `audioTimeProvider` defaults to returning AudioContext.currentTime when present, but for tests we inject a deterministic provider. All math uses `audioTimeProvider()` — no `Date.now`, no `performance.now`. Tempo changes and time-signature changes are effective at a specified SecondsTime; schedule math before that time uses the old value, at/after uses new value (piecewise linear beat accumulation).
  - `BeatBarScheduler` class in `packages/audio-core/src/scheduler/BeatBarScheduler.ts`: holds a reference to IClock. Uses a main-thread interval tick (25ms default) that scans beats within (clock.now(), clock.now() + lookAhead) and fires uncommitted listeners; beats within (clock.now(), clock.now() + commitHorizon] are marked committed, fired on committed listeners, and remembered so they don't re-fire. `cancelFuture(olderThanHorizon=false)`: if false, cancels tentative-only beats beyond commit horizon; if true (force), attempts to cancel everything but MUST return an error for committed events (via Result<E>). Deterministic: same tempo history + same input time sequence → identical event sequence.
  - Re-export everything from index.ts.
  - Add a single `AudioClockError extends Error` and `ScheduleError extends Error`; all throw sites use those or return Result<..., AudioClockError | ScheduleError>.
  - No AudioWorklet code yet (M2+); scheduler is main-thread only for M1 (events are timestamps, which is sufficient for M1's deterministic scheduler testing).
- **Acceptance Criteria Addressed**: AC-5, AC-10, AC-11
- **Test Requirements**:
  - `rule` TR-4.1: `tsc --noEmit` on audio-core still succeeds. Evidence: command output.
  - `rule` TR-4.2: Grep within `AudioClock.ts` and `BeatBarScheduler.ts` for `Date\.now` and `performance\.now` returns zero hits inside scheduling math (imports/use in comments/ProbeReading wall-clock-only field are OK — annotated with a comment `// measurement only, never used for scheduling`). Evidence: grep output.
  - `rule` TR-4.3: Classes implement interfaces: `class AudioClock implements IClock`, `class BeatBarScheduler implements IBeatBarScheduler`. Evidence: source file line matches.
  - `rule` TR-4.4: `cancelFuture(false)` leaves committed events untouched (returns Result.err if caller tries to cancel committed events with the force flag). Evidence: covered in Task 5 test.
  - `rubric` TR-4.5: Code cleanliness; scale 1-5; anchors 1 = uncommented spaghetti, 3 = works but inconsistent style, 5 = consistent style (ESLint or Prettier not required but internal consistency), typed errors, no `any`, units branded throughout; threshold >= 4. Evidence: manual review.

## Task 5: Implement M1 tests, actually run them, and capture results honestly
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 4
- **Description**:
  - Install Vitest at root if not done in Task 1; configure `vitest.config.ts` for each package (or root config).
  - `packages/audio-core/__tests__/AudioClock.test.ts`:
    - Test 5.1 (happy path, 4/4 120 BPM): Inject deterministic time provider that steps 0s→1s→2s→5s. Assert that beat 0 @ 0s, beat 1 @ 0.5s, beat 2 @ 1s; bar 0 @ 0s, bar 1 @ 2s, bar 2 @ 4s.
    - Test 5.2 (tempo change effective at T=2s, old=120, new=60): beat after 2s advances at 1s/beat. Compute expected beat at T=3s = (2s * 2 beats/s) + ((3-2)s * 1 beat/s) = 5.0. Assert.
    - Test 5.3 (time signature change): 4/4→3/4 at T=2s; bar boundaries after T=2s align to 3-beat bars.
    - Test 5.4 (branded type conversions round-trip: beat↔seconds, within a single tempo regime, tolerance 1e-9 s).
    - Test 5.5 (probeNow returns audioTime used for beat/bar calculation — check that `probe.audioTime === clock.now()` at call moment).
  - `packages/audio-core/__tests__/BeatBarScheduler.test.ts`:
    - Test 5.6 (deterministic event sequence): Simulate 5 seconds of 25ms ticks with a mock clock advancing deterministically; collect beat events; compare against a hand-computed expected list of (beatIndex, committed).
    - Test 5.7 (commit horizon): lookAhead=200ms, commitHorizon=40ms. At a given tick, assert that events within [now, now+40ms] are marked committed; events in (now+40ms, now+200ms] are marked tentative.
    - Test 5.8 (cancelFuture(false) removes tentative only, leaves committed). Tentative count drops to 0, committed count stays same.
    - Test 5.9 (cancelFuture(true) on committed events returns Result.err): Call with true on a state that has committed events; Result is error.
    - Test 5.10 (idempotence: run scheduler twice with identical clock sequence → identical emitted event list deep-equal).
  - Actually execute `pnpm -r test` (or `vitest run`) and capture stdout/stderr. Do not fabricate results; if a test fails, include the failure in the evidence and report honestly. If tests are skipped (e.g., no AudioContext shim needed because we're using a pure time provider), state that and justify.
- **Acceptance Criteria Addressed**: AC-6, AC-13
- **Test Requirements**:
  - `rule` TR-5.1: At least 8 test files/cases exist (5 AudioClock + 5 BeatBarScheduler as described). Evidence: test file listing and `it/test` block count.
  - `rule` TR-5.2: Tests are actually invoked; the exact command and its full stdout/stderr are captured and included as Completion Evidence (and later pasted into INIT_REPORT.md). Evidence: raw command output transcript.
  - `rule` TR-5.3: Each test is listed with pass/fail/skip status honestly — no "pass" claim without a matching line in the output. Evidence: the same transcript.
  - `rubric` TR-5.4: Test rigor; scale 1-5; anchors 1 = 1-2 tests, 3 = happy-path only, 5 = covers tempo/time-signature changes, commit/tentative boundary, cancellation semantics, determinism, round-trip, error paths; threshold >= 4. Evidence: manual test file review.

## Task 6: Write final INIT_REPORT.md and prepare user summary
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Tasks 2, 3, 4, 5, 7
- **Description**:
  - Create `docs/INIT_REPORT.md` with sections:
    1. **What Already Existed**: Explicit list of pre-existing files before implementation (only `.trae/specs/ai-duet-init/spec.md` and `.trae/specs/ai-duet-init/tasks.md`).
    2. **What I Created or Changed**: Absolute paths for every new/changed file, grouped by category (docs, root config, packages, tests, spec artifacts).
    3. **Architecture Decisions**: 1-liners each with link to the doc section that contains the full justification. E.g., "PM: pnpm + workspaces (ENGINEERING_RULES.md#Package-Manager-Choice)".
    4. **Commands**: Exact shell commands (copy-pasteable) to: install deps, build all TS packages, build web-app, run tests, run a manual M1 demo harness (Node script that instantiates AudioClock with fake provider and prints beats), run the web-app dev server.
    5. **Test Results**: Per test file, pass/fail/skip count with verbatim excerpt from Task 5's captured transcript. Do not lie about passes. Include build result status for each TS package (actual command output).
    6. **What Is Functional vs Mocked**: Bullet list: e.g., "AudioClock beat/bar math: functional; BeatBarScheduler event dispatch: functional via mock clock; ITransport play/pause in web-app: unimplemented stub returning Result.err 'NotImplemented'; singing engine: interface only, no render; song lists + turn indicator + progress: UI-only mock data with internal ticking observable; no actual playback audio".
    7. **Important Issues Still Needing Attention**: Concrete TODOs/blockers identified during implementation (e.g., "OfflineAudioContext not used; tests rely only on deterministic time provider — live audio integration needed in M2", "React Router installed (justify) — audit dep footprint", "No actual mic/headphone check UI yet").
    8. **Known Risks**: 7+ risks from docs + any implementation-specific risks.
    9. **Single Next Implementation Step**: One concrete sentence (not a list): "Wire the `MockTransport` / `StubTransport` in `@ai-duet/web-app` to a real `ITransport` implementation backed by `@ai-duet/audio-core` `AudioClock` + `BeatBarScheduler` so clicking Play actually drives the clock and the UI turn indicator reacts to real beat events, still with no audio buffer scheduling yet."
    10. **Next Milestone**: String exactly "M2 = backing-track lane + click track + latency calibration harness" plus 2-3 sentences of the M2 deliverable detail from ROADMAP.md.
  - Prepare the final assistant response content mirroring this structure.
- **Acceptance Criteria Addressed**: AC-8, FR-7 items
- **Test Requirements**:
  - `rule` TR-6.1: `docs/INIT_REPORT.md` exists with 10 sections, next-milestone string matches exactly, and single-next-step sentence is present. Evidence: file content.
  - `rule` TR-6.2: Every file created during Tasks 1–5 + 7 is listed in the What I Created or Changed section with absolute path. Evidence: manual audit of `find` output vs report.

## Task 7: Implement consumer-facing React + TypeScript UI shell (3 pages, responsive, ITransport stub, audio/UI separation)
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 3 (needs ITransport definition from audio-core)
- **Description**:
  - **Build tool**: `@ai-duet/web-app` uses Vite + React 18 + TypeScript + strict mode. Install `react-router-dom` if routing is needed (justify in ENGINEERING_RULES: standard minimal routing; no UI component library — plain CSS modules only).
  - **Typed audio boundary (in audio-core)**: Define and export `ITransport` interface from `@ai-duet/audio-core/src/transport/types.ts`:
    ```ts
    export type Turn = 'human' | 'ai';
    export interface PositionUpdate { seconds: SecondsTime; isPlaying: boolean; }
    export type RemoveListener = () => void;
    export interface ITransport {
      play(): Result<void, TransportError>;
      pause(): Result<void, TransportError>;
      seek(target: SecondsTime): Result<void, TransportError>;
      onPositionChange(cb: (u: PositionUpdate) => void): RemoveListener;
      onTurnChange(cb: (t: Turn) => void): RemoveListener;
      currentTurn(): Turn;
    }
    export type TransportError =
      | { kind: 'NotImplemented'; message: string }
      | { kind: 'AudioContextUnavailable'; message: string }
      | { kind: 'SeekOutOfRange'; message: string; max: SecondsTime };
    ```
  - **Stub implementation (in audio-core, but no audio)**: `StubTransport` class implements `ITransport`. `play/pause/seek` all return `Result.err({kind:'NotImplemented', message:'Transport audio not wired in M1'})`. The stub also provides an internal `MockTicker` (disabled by default) that consumers of the stub in web-app can explicitly enable for UI demo purposes — the MockTicker's progress/turn events flow from the stub via the listeners, NOT computed inside React.
  - **Home page (`/`)**: Search bar, Featured Songs horizontal scrolling grid, All Songs vertical list. Mock song data: 3 songs, no copyrighted content — use generic placeholder names: "Twilight Duet (Traditional, Public Domain Demo)", "Midnight Canon (Demo, Original Instrumental)", "Sunrise Line (Demo, Original)". Use placeholder album art via CSS gradients (NO external image URLs, NO fetch). Export mock data from `web-app/src/data/mockSongs.ts` typed as `Song[]`.
  - **Song detail + duet mode picker (`/song/:id`)**: Song artwork, title, artist; 3 duet-mode radios ("AI sings alternate lines" (default), "AI sings chorus", "AI sings harmony"); "Start duet" button navigates to `/play/:id?mode=...`.
  - **Duet player (`/play/:id`)**: Layout: back button top-left, song title top-center. Album art middle. Lyrics line center below art. Turn pill: "You sing next" (teal) / "AI sings next" (magenta) below lyrics. Transport controls at bottom: prev-phrase (skip back) · play/pause (large centered, ≥ 44px tappable) · next-phrase · volume slider far right. Position bar below controls. NO waveforms. NO canvas. NO mixing panels.
  - **Responsive CSS**: `@media (max-width: 480px)` collapses horizontal lists, album art max-width 80vw, transport controls wrap to 2 rows if needed, turn pill font scales. No horizontal scroll on 375px.
  - **Audio/UI separation invariant enforcement in code**: (a) React components never compute beat/bar/turn logic directly; turn value always comes from `useTransport()` hook subscribing to `onTurnChange`. (b) Progress bar value always comes from `onPositionChange`, never a React state incrementer in a component. (c) If a mock ticker is used, it lives in a class/utility outside React, and the hook subscribes to it.
  - **No fake vocals, no pretend ML, no fetch calls in source**.
  - Build web-app: `pnpm --filter @ai-duet/web-app build` must succeed.
- **Acceptance Criteria Addressed**: AC-10, AC-14, AC-15, AC-16, NFR-7, NFR-8
- **Test Requirements**:
  - `rule` TR-7.1: `pnpm --filter @ai-duet/web-app build` succeeds (actual exit code + excerpt captured and attached as evidence). Evidence: build output transcript.
  - `rule` TR-7.2: Three route components exist: `Home.tsx`, `SongDetail.tsx`, `Player.tsx`; three route paths registered in App.tsx router. Evidence: file listing + route config excerpt.
  - `rule` TR-7.3: Grep for DAW UI in `packages/web-app/src` is empty: `grep -rE "canvas|Waveform|MixerPanel|FaderBank|audioMeter" packages/web-app/src`. Evidence: empty output.
  - `rule` TR-7.4: Mobile breakpoint CSS exists: `grep -r "@media.*max-width.*480" packages/web-app/src` non-empty. Evidence: output.
  - `rule` TR-7.5: `ITransport` is defined in audio-core and imported in web-app; clicking Play in a test or code excerpt calls `transport.play()` which returns a `Result.err` with `{ kind: 'NotImplemented' }` — verify with a small unit test in web-app `__tests__/StubTransport.test.ts`. Evidence: test output.
  - `rule` TR-7.6: React separation: no React component file (`.tsx`) under `web-app/src` contains a regex match `(bpm|beat|tempo)\s*[/\*]?\s*60` (inline beat math) — just a sanity check. Evidence: grep empty.
  - `rubric` TR-7.7: UI consumer-karaoke aesthetic; scale 1-5; anchors 1 = no CSS, 3 = usable but ugly/overcrowded; 5 = clean music-player aesthetic with large tap targets, color-coded turn pill, mobile breakpoint works, no engineering UI; threshold >= 4. Evidence: manual review of built HTML/CSS or static JSX+CSS inspection.
