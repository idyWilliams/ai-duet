# AI Duet - Architecture & Repository Initialization (Milestone 0)

## Overview
- **Summary**: Architecture design, monorepo scaffolding, documentation, and Milestone 1 code scaffold for AI Duet—a browser-based real-time AI singing partner. V1 supports one properly licensed or public-domain song with authored lyrics and melody, headphones, a stable tempo clock, and alternating human/AI phrases.
- **Purpose**: Establish a strong architectural foundation before any singing/ML work, define clear component boundaries and typed interfaces, document engineering rules, and deliver a working, tested audio clock and beat/bar scheduler (Milestone 1) as the first executable vertical slice.
- **Target Users**: (a) Engineers building AI Duet V1, (b) end-user product audience (casual singers, karaoke hobbyists, music-streaming users evaluating the app) — AI Duet is a **consumer music/karaoke app**, not a DAW; the UI shell ships in this phase so product design and engineering progress in parallel.

## Product UX Direction (Consumer App, Not a DAW)
The UI must feel familiar to modern music-streaming and karaoke apps:
- **Home screen**: search bar, grid/list of song artwork tiles, curated/featured song list.
- **Song selection + duet-mode picker**: choose a song, choose a duet mode (AI sings chorus only, AI sings harmony, AI sings alternate lines — for M0+M1 these options are present in UI only, the audio layer is not wired).
- **Live duet player**: familiar music-player layout (album art, song title/artist, scrubbed transport timeline **showing only playback position, not multi-track waveforms**, basic controls: play/pause, skip-phrase (no reorder tracks), volume slider), lyrics line displayed center-screen, **a small pill/indicator showing "You sing next" vs "AI sings next"**.
- **Mobile-responsive**: works on 375px iPhone SE width up to desktop.
- **Explicitly excluded from UI**: persistent waveforms, studio mixing panels, multi-track timelines, dense technical dashboards, fader banks, routing matrices, audio-engineering knobs.
- **Separation invariant**: React state and rendering never control audio scheduling; UI only emits typed transport commands (start/stop/seek) to the audio layer; audio time flows one-way into UI via subscriptions for display only.

## Goals
1. Propose and implement a minimal monorepo structure with explicit package responsibilities and dependency boundaries, selecting a package manager and monorepo tool with justification.
2. Author five documentation artifacts: PRODUCT_SPEC.md, ARCHITECTURE.md, AUDIO_ARCHITECTURE.md, ENGINEERING_RULES.md, ROADMAP.md (updated to reflect the consumer UX direction).
3. Define core TypeScript interfaces for the audio scheduler, mixer, backing-track lane, clock, analyzers, score follower, performance engine, and singing engine.
4. Identify feasibility risks for the singing synthesis pipeline and propose a benchmark for singing-engine render time per bar.
5. Scaffold Milestone 1 code: an audio clock and deterministic beat/bar scheduler, fully typed, with automated tests.
6. Ship a **minimal React + TypeScript consumer-facing UI shell** (home, song selection, duet player pages) with karaoke-style layout, mobile-responsive, no DAW panels, with a typed transport-command boundary to the audio layer. Singing engine stays explicitly unimplemented / not faked.
7. Report at the end: files created, changes made, architecture decisions, commands to run, real build/test results (no fabrication), what is functional vs mocked, known issues, and the exact next milestone.

## Non-Goals
- Implementing any singing synthesis, AI vocals, or ML functionality (real **or** fake). Singing engine interface only; rendering is a stub that errors with "not implemented."
- Supporting arbitrary songs, free improvisation, or automatic song recognition.
- Any DAW-style UI artifacts: multi-track waveforms, mixing consoles, multi-lane timelines, routing panels, audio-engineering metering.
- Database, authentication, network services, or session orchestration backend.
- Claiming tests pass without actually running them and showing real output.

## Background & Context
- The repository is currently empty at `/Users/mac/Documents/ai-duet`.
- Technology stack mandated by lead stakeholder: React, TypeScript, Web Audio API, AudioWorklet, Node.js/TypeScript for session orchestration, Python/PyTorch for singing synthesis and audio ML experiments.
- The architectural invariants (11 items) in the user request are treated as hard engineering rules.
- V1 scope: one licensed/public-domain song with lyrics+melody, headphones required, tempo clock + backing/click track, alternating human/AI phrases.

## Functional Requirements

### FR-1: Monorepo Structure & Dependency Boundaries
- Select one package manager (npm, pnpm, or yarn) and one monorepo tool (pnpm workspaces, npm workspaces, Turborepo, or Nx), document the choice with justification, and initialize config files accordingly.
- Define at minimum four packages: `@ai-duet/audio-core` (TS, Web Audio + AudioWorklet code: clock, scheduler, mixer, analyzers, score follower types, interfaces), `@ai-duet/performance-engine` (TS: performance engine + singing engine types and interfaces), `@ai-duet/web-app` (React/TS UI shell, minimal for M1), `@ai-duet/ml-experiments` (Python/PyTorch scaffold: no functional code, only README + package structure).
- Enforce dependency direction: `audio-core` may not depend on `performance-engine` or `web-app`; `performance-engine` may depend on `audio-core` but not `web-app`; `web-app` may depend on both; `ml-experiments` is independent of the TS packages.
- No dependencies are added without a one-line justification in ENGINEERING_RULES.md.

### FR-2: Documentation Artifacts
- `docs/PRODUCT_SPEC.md`: V1 product overview, users, user stories, in-scope song model, phrase alternation contract, headphones requirement, out-of-scope items.
- `docs/ARCHITECTURE.md`: Overall layered architecture, package responsibilities, component list with typed interface names, data flow (clock → score follower → performance engine → singing engine → scheduler → mixer), look-ahead + commit-horizon design, error surfaces.
- `docs/AUDIO_ARCHITECTURE.md`: Audio thread vs main thread boundary, AudioContext-as-authoritative-timeline rule, AudioWorklet constraints, clock model (tempo, beats, bars, time signature), beat/bar scheduling model, latency calibration and Bluetooth limitations, input/output routing, lane model (backing, human, AI), headphone requirement rationale.
- `docs/ENGINEERING_RULES.md`: Architectural invariants 1–11 restated as enforceable rules, package manager + monorepo tool choice with justification, dependency approval log (each dep and why it is added), typing/error handling/test rules, latency measurement process, content licensing rule.
- `docs/ROADMAP.md`: Milestones 0–N. M0 = this work; M1 = audio clock + deterministic beat/bar scheduler + tests; M2 = backing-track lane + click track + latency calibration harness; M3 = score follower for one authored score; M4 = performance engine with look-ahead + commit horizon + fallbacks; M5 = singing engine integration + fallback cache; M6 = React UI + human phrase capture + end-to-end demo.

### FR-3: Core TypeScript Interfaces
- In `@ai-duet/audio-core/src/`: define and export interfaces for `IClock`, `IBeatBarScheduler`, `IAudioScheduler`, `IMixer`, `IBackingTrackLane`, `IAnalyzer`, `IScoreFollower` (with song position, section, phrase, confidence output), plus `BeatTime`, `BarTime`, `SecondsTime`, `AudioFrameTime`, `Confidence` branded/opaque types.
- In `@ai-duet/performance-engine/src/`: define and export interfaces for `IPerformanceEngine` (inputs: clock state, score position, lyrics+melody, analyzer confidence; outputs: tentative plans + committed plan), `ISingingEngine` (render request, render result, render timeout/failure contract, cached fallback hook), `PlanHorizon`, `PhraseTurn`, `RenderedVocal`.
- Zero `any` types; use `unknown` plus guards if generic input is needed.

### FR-4: Feasibility Risks & Singing-Engine Benchmark
- In docs, enumerate feasibility risks covering: (a) end-to-end latency budget, (b) singing synthesis render time vs look-ahead window, (c) AudioWorklet/main thread communication overhead, (d) Bluetooth audio drift, (e) score follower confidence accuracy on real singing, (f) licensing/content rights for V1 song, (g) Web Audio support on mobile browsers.
- Define a benchmark spec: "Render a single 4-bar phrase (4/4, 120 BPM) to a 48kHz 32-bit float mono audio buffer; measure wall time from request submission to buffer available; repeat N=20 times; report p50, p95, p99; pass threshold: p95 < 80% of the phrase's wall-clock duration." Rationale: leaves 20% slack for scheduling, mixer, and jitter.

### FR-5: Milestone 1 Code Scaffold (Audio Clock + Deterministic Beat/Bar Scheduler)
- In `@ai-duet/audio-core`, implement a concrete `AudioClock` class conforming to `IClock`: accepts tempo (BPM), time signature (top/bottom), AudioContext reference; exposes current beat, current bar, absolute audio time, and advance/lookup methods. All time math uses AudioContext.currentTime exclusively—never `Date.now`/`performance.now` for musical scheduling.
- Implement a concrete `BeatBarScheduler` class conforming to `IBeatBarScheduler`: using a look-ahead window (configurable, default 100ms) and commit horizon (default 20ms), emits typed beat and bar events at their scheduled audio times with deterministic beat numbers; supports cancellation of events beyond the commit horizon; replannable.
- Automated tests for both classes using a mocked or offline AudioContext where feasible; if no AudioContext mock is available, use Node-based unit tests on the pure time-conversion math plus a manual verification harness comment. Test determinism: same tempo + same audio time vector → same beat/bar sequence. Tests live in per-package `__tests__/` or `.test.ts` files.
- audio-core package: No React UI. No network. No singing. No ML.
- Build toolchain: TypeScript with strict mode enabled (strict, noImplicitAny, strictNullChecks, exactOptionalPropertyTypes, noUncheckedIndexedAccess where available).

### FR-6: Consumer-Facing React + TypeScript UI Shell
- Package: `@ai-duet/web-app`. Built with Vite + React 18 + TypeScript (strict). No UI component library; plain CSS modules or plain CSS.
- Pages/routes (client-side, using a minimal in-app state router or React Router with justification):
  - **Home (`/`)**: Search bar at top, "Featured Songs" horizontal carousel of artwork tiles, "All Songs" vertical list with artwork + title + artist. Mock song data (2–3 sample songs, no copyrighted lyrics/melody committed) — UI only.
  - **Song select + duet mode picker (`/song/:id`)**: Song artwork, title, artist, short description; "Start duet" CTA button, 3 duet-mode radio buttons: "AI sings alternate lines", "AI sings chorus", "AI sings harmony". Selection is stored in UI transport state only.
  - **Duet player (`/play/:id?mode=...`)**: Familiar music-streaming player layout. Top = song header with back button. Middle = album art centered. Below = song title + artist. Center-screen = one lyric line (mock data, no waveform, no waveform ever. Below lyrics = small pill "You sing next" / "AI sings next" turn indicator with color-coded: human = teal/blue, AI = magenta/pink. Transport controls: play/pause button large centered, skip-to-next-phrase button left/right, volume slider far right. Position bar (position only, does not show tracks or faders or mixing console). No waveform. No mixing panels. No audio-engineering metering.
- Mobile-responsive design: media queries for @media (max-width: 480px), works down to iPhone SE (375px). No horizontal scroll at 375px.
- Typed audio-transport boundary:
  - web-app imports `ITransport` from `@ai-duet/audio-core` (or defined locally in audio-core) with methods: `play()`, `pause()`, `seek(seconds)`, `onPositionChange(cb)`, `onTurnChange(cb: (turn: 'human'|'ai') => void)`. For M0/M1, the implementation is a stub: `play()` returns a `Result.err("NotImplemented("audio transport not wired in M1")`; the UI consumes events from an internal mock-observable that ticks every 500ms to demo the turn indicator and progress bar.
  - React state DOES NOT compute beats or schedule audio. React state only stores: current route, current search query, selected song ID, duet mode, UI toggles. Audio time (seconds, if any) flows into React as an observable subscription, never the reverse.
- Singing engine: The UI explicitly does not render vocals. No fake/mock AI audio. The turn indicator and song list are data mocks (static data).

### FR-7: Final Report
- After implementation, produce a textual report (final assistant message + `docs/INIT_REPORT.md`) listing:
  1. **What already existed** (spec artifacts from prior work).
  2. **What you created or changed** (absolute paths; diff vs empty repo or prior state).
  3. **Exact commands** and **actual build/test results** (transcripts, no fabrication).
  4. **What is functional vs mocked** (e.g., clock math functional; singing unimplemented stub; UI shell functional with mock data; transport stubbed).
  5. **Important issues still needing attention** (e.g., any test failures, missing env, TODOs).
  6. **Single next implementation step** (one item, concrete: "Wire the transport stub in web-app to a real ITransport implementation over the audio-core scheduler).
  7. Architecture decisions and doc links.
  8. Known risks.
  9. Next milestone name = M2 with exact deliverable text: "backing-track lane + click track + latency calibration harness".

## Non-Functional Requirements
- **NFR-1 (Typing)**: TypeScript strict mode enabled in all TS packages; no `any`; explicit return types on exported functions.
- **NFR-2 (Error Handling)**: All public interfaces throw typed Error subclasses or return discriminated `Result<T, E>` unions; never silently swallow failures.
- **NFR-3 (Tests)**: At least 80% line coverage on Milestone 1 code paths (auditable via Istanbul/nyc output if available, or declared with caveat if tooling is deferred to M1a follow-up).
- **NFR-4 (Measurable Latency)**: ENGINEERING_RULES.md defines latency measurement hooks; M1 exposes `IClock` timing probes; the scheduler logs event schedules vs audio-time occurrences with a delta metric.
- **NFR-5 (Content Rights)**: ROADMAP.md and PRODUCT_SPEC.md both state that M6 (song selection) requires documented license; no copyrighted lyrics/melodies are committed before then.
- **NFR-6 (No Infrastructure Bloat)**: Dependencies added are minimal. Justify each in ENGINEERING_RULES.md. Do not add databases, auth libraries, HTTP frameworks, or UI component libraries in this phase.
- **NFR-7 (Mobile Responsive UI)**: web-app renders without horizontal scroll at 375px viewport width; transport controls and turn indicator remain tappable (≥ 44px touch targets) at mobile widths.
- **NFR-8 (Audio / UI Separation)**: In web-app, a source-grep for `setInterval` / `setTimeout` / `requestAnimationFrame` with beat/bar math inside React components returns zero matches; beat math, if any exists in the app layer for display, is computed by a typed utility imported from audio-core and passed via subscription only.

## Constraints
- **Technical**: React + TypeScript on frontend; Web Audio + AudioWorklet for audio; Node/TS for orchestration; Python/PyTorch for ML experiments. AudioContext timeline is authoritative; no wall-clock musical scheduling. UI state never controls real-time audio timing. AudioWorklet code must not do network or expensive ML inference.
- **Business**: V1 ships with one song whose usage rights are cleared; headphones required; free improvisation and auto-recognition excluded.
- **Dependencies**: Node 20+ LTS, Python 3.11+, npm/pnpm/yarn (one chosen). TypeScript ^5. Test runner TBD (Vitest or Jest) — must be justified.

## Assumptions
- Audio availability: development machines have working audio outputs; offline AudioContext or a synthetic time driver can be used for headless tests.
- Node 20+ and Python 3.11+ are available in the development environment.
- The V1 song selection and licensing work is deferred to M6; no song assets are committed in this phase.
- A headphone requirement in V1 is acceptable (no speaker/splitscreen duet mode).

## Acceptance Criteria

### AC-1: Five documentation files exist with required sections
- **Type**: `rule`
- **Given**: A clean repository root
- **When**: The implementation task queue has drained
- **Then**: Files `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/AUDIO_ARCHITECTURE.md`, `docs/ENGINEERING_RULES.md`, and `docs/ROADMAP.md` all exist and each contains the sections enumerated in FR-2.
- **Pass Condition**: `ls docs/` lists all five files; a content grep on each file for the mandated section headings returns at least one match.
- **Evidence**: Shell command output of `ls docs/` and per-file heading grep.

### AC-2: Monorepo initialized with chosen tool, 4 packages, correct dependency boundaries
- **Type**: `rule`
- **Given**: Spec-approved package manager + monorepo tool choice
- **When**: Root install/build commands are run
- **Then**: Four packages (`audio-core`, `performance-engine`, `web-app`, `ml-experiments`) exist; build/type-check of `audio-core` succeeds without importing from `performance-engine` or `web-app`; `performance-engine` builds importing only from `audio-core` (and stdlib); `web-app` builds importing from both; `ml-experiments` contains a Python project scaffold and no TS dependency.
- **Pass Condition**: Each package has its own package manifest; ESLint/TS or manual import audit confirms direction; `pnpm -r build` (or chosen tool equivalent) succeeds for TS packages.
- **Evidence**: Command output of root install + per-package build; dependency graph dump if tool supports it.

### AC-3: Core TS interfaces defined, zero `any`, strict TS config
- **Type**: `rule`
- **Given**: The TS source trees
- **When**: `tsc --noEmit` runs with strict presets
- **Then**: `IClock`, `IBeatBarScheduler`, `IAudioScheduler`, `IMixer`, `IBackingTrackLane`, `IAnalyzer`, `IScoreFollower` are exported from `@ai-duet/audio-core`; `IPerformanceEngine`, `ISingingEngine`, `PlanHorizon`, `PhraseTurn`, `RenderedVocal` are exported from `@ai-duet/performance-engine`; `grep -r ": any" src` returns zero matches across TS packages; tsconfig has strict + noImplicitAny + strictNullChecks on.
- **Pass Condition**: Interface exports are resolvable via TS; no `: any` matches; tsconfig flags verified.
- **Evidence**: `tsc --noEmit` output; interface import smoke-test script output; `grep` output.

### AC-4: Risks enumerated and singing-engine benchmark defined
- **Type**: `rule`
- **Given**: The docs tree
- **When**: Reading the relevant docs
- **Then**: At least 7 distinct feasibility risks are documented covering each risk category from FR-4; the benchmark spec for singing-engine render-time-per-bar is stated with N, measure, p50/p95/p99 reporting, and pass-threshold formula.
- **Pass Condition**: Doc contains ≥ 7 enumerated risks with categories and at least one mitigation sketch each; benchmark section contains N, metric, percentiles, and threshold with rationale.
- **Evidence**: Excerpts from doc file content.

### AC-5: M1 AudioClock and BeatBarScheduler implemented and typed
- **Type**: `rule`
- **Given**: `@ai-duet/audio-core` source
- **When**: Code inspection and `tsc --noEmit`
- **Then**: Concrete classes `AudioClock` (implements `IClock`) and `BeatBarScheduler` (implements `IBeatBarScheduler`) exist; all time math is derived from an `AudioContext`-sourced currentTime (no `Date.now`, no `performance.now` used for musical event times); scheduler exposes look-ahead window and commit horizon; events beyond commit horizon are cancellable.
- **Pass Condition**: Files exist; classes implement the interfaces; a grep for `Date.now` and `performance.now` within the two class implementations returns zero hits for musical scheduling uses (import-only or harness-only uses are acceptable if commented).
- **Evidence**: File listing; TS compile output; grep output.

### AC-6: M1 automated tests exist and have been run (pass/fail reported honestly)
- **Type**: `rule`
- **Given**: Test files are present in M1 packages
- **When**: The test command is executed from the repo root
- **Then**: Test output exists and is captured; every test case's result (pass/fail/skip) is reported honestly in the final report. No "passed" claim without a matching command invocation and output.
- **Pass Condition**: Test command executes to completion (exit code captured); each test file is listed with its result in INIT_REPORT.md and the final message.
- **Evidence**: Full test command stdout/stderr transcript.

### AC-7: Package manager + monorepo tool choice justified in ENGINEERING_RULES.md
- **Type**: `rule`
- **Given**: ENGINEERING_RULES.md exists
- **When**: Reading it
- **Then**: A single package manager and single monorepo tool are named; the choice is compared against at least two alternatives; the rationale includes disk space, install speed, TS monorepo ergonomics, and Python/ml-experiments isolation.
- **Pass Condition**: The section exists and names one PM + one monorepo tool with explicit comparison to ≥ 2 alternatives.
- **Evidence**: Documented section text.

### AC-8: Final report file exists and names M2 explicitly
- **Type**: `rule`
- **Given**: `docs/INIT_REPORT.md`
- **When**: The file is read after implementation
- **Then**: File lists (a) files created (absolute paths), (b) architecture decisions with doc links, (c) exact commands: install / build / test / manual harness if any, (d) test execution status per test file, (e) known risks list, (f) next milestone = M2 with its exact deliverables: "backing-track lane + click track + latency calibration harness."
- **Pass Condition**: All six sub-items present; M2 deliverable string matches exactly.
- **Evidence**: File content excerpt.

### AC-9: Architectural invariants 1–11 quoted verbatim in ENGINEERING_RULES.md
- **Type**: `rule`
- **Given**: ENGINEERING_RULES.md
- **When**: Reading the "Architectural Invariants" section
- **Then**: The 11 invariants from the user request are present verbatim.
- **Pass Condition**: Diff of the text matches all 11 sentences.
- **Evidence**: Section content.

### AC-10: No forbidden dependencies, no fake ML, no DAW UI, no arbitrary-song scaffolding
- **Type**: `rule`
- **Given**: Full repository state after implementation
- **When**: Inspecting package.json manifests and source trees
- **Then**: No fake-singing / pretend-ML code exists; no database/ORM/auth/HTTP-framework packages are listed as dependencies; no arbitrary-song metadata parsers; no DAW-style UI elements (no persistent waveforms rendered via canvas/svg, no multi-track mixer panels, no fader banks, no audio-engineering knob components). `web-app` contains a consumer-karaoke UI shell per FR-6 (allowed).
- **Pass Condition**: Grep for terms like "synth", "neural", "fake_", "auth", "postgres", "mongo", "express", "fetch", "Waveform", "MixerPanel", "FaderBank", "canvas" in source (not test, not ml-experiments README, not docs) returns zero matches for forbidden patterns; package.json dependency lists audited manually.
- **Evidence**: grep output; concatenated package.json dependency sections; screenshot of player UI (no DAW panels).

### AC-14: Consumer UI shell (3 pages, responsive, no waveforms/DAW panels
- **Type**: `rule`
- **Given**: web-app package
- **When**: Running `pnpm --filter @ai-duet/web-app build` + static inspection of JSX/CSS
- **Then**:
  (a) Home page exists with search bar, featured songs carousel/song grid, all-songs list;
  (b) Song select + duet-mode page exists with artwork + 3 mode radios + CTA;
  (c) Duet player page exists with: album art + title + one lyric line + colored "You/AI sing next" turn pill + play/pause + skip-phrase + volume + position bar;
  (d) Mobile CSS breakpoint exists (max-width 480px or narrower) and layout collapses;
  (e) No canvas/svg waveform, no multi-track, no mixing panel, no fader, no audio-engineering knob widgets anywhere in JSX/CSS.
- **Pass Condition**: `grep -r "canvas\|<svg.*waveform\|Fader\|MixerPanel" packages/web-app/src` returns empty; `grep -r "@media.*max-width.*480" packages/web-app/src` non-empty; build succeeds and the three route components exist.
- **Evidence**: Build output; grep outputs; component file listing.

### AC-15: Audio/UI separation invariant held; singing engine explicitly unimplemented
- **Type**: `rule`
- **Given**: web-app source + any ITransport impl
- **When**: Source audit
- **Then**:
  (a) React components do not compute beats/bars or schedule audio; if React displays a "progress" value it comes from a subscription/prop only;
  (b) There exists an `ITransport` interface (in audio-core or defined in web-app and re-exported) with `play/pause/seek/onPositionChange/onTurnChange`;
  (c) The concrete `play()` invocation or transport hook returns Result.err with message containing "not implemented" or "NotImplemented" — singing / audio transport is NOT faked.
- **Pass Condition**: (i) In React source files, no React component function body contains `Math.floor / Math.round * bpm / 60 scheduling pattern; (ii) `ITransport` symbol exported and used; (iii) Invocation of play returns error when user clicks Play (or a unit test proves) the err case with matching text.
- **Evidence**: grep patterns; symbol export; test output or code excerpt.

### AC-16: UI consumer-karaoke visual quality
- **Type**: `rubric`
- **Dimension**: Visual fidelity to the stated "modern music-streaming/karaoke app" aesthetic
- **Scale**: 1-5
- **Anchors**: 1 = plain unstyled HTML `<div>`s only; 3 = styled but no layout flow or inconsistent spacing; 5 = clean visual hierarchy, artwork tiles, color-coded turn pill, mobile layout works, tap targets large, no audio-engineering UI anywhere.
- **Pass Threshold**: >= 4
- **Evidence**: Manual review of the rendered pages (build output + screenshot or static CSS/JSX review).

### AC-11: Module boundary quality
- **Type**: `rubric`
- **Dimension**: Cohesion and decoupling of packages / interfaces / classes
- **Scale**: 1-5
- **Anchors**: 1 = all code dumped in one package with circular deps; 3 = packages separated but many interfaces leak implementation details; 5 = each package has a single clear responsibility, interfaces are minimal and behavior-complete, dependency direction is strictly enforced, no circular imports.
- **Pass Threshold**: >= 4
- **Evidence**: Manual code review notes; import graph; TS circular-dependency warning output if applicable.

### AC-12: Documentation clarity and completeness
- **Type**: `rubric`
- **Dimension**: Readability, actionable detail, and traceability of the five core docs
- **Scale**: 1-5
- **Anchors**: 1 = placeholder stubs only; 3 = each doc exists and has sections but many are vague or contradict each other; 5 = all sections are filled, cross-references between docs are consistent, an engineer could start M2 without asking follow-up questions.
- **Pass Threshold**: >= 4
- **Evidence**: Manual document review.

### AC-13: Test coverage and determinism focus
- **Type**: `rubric`
- **Dimension**: Quality and rigor of the M1 test suite
- **Scale**: 1-5
- **Anchors**: 1 = no tests; 3 = a few happy-path tests only; 5 = happy path + edge cases (tempo changes, time signature changes, cancellation inside/outside horizon, rollover from beat N to bar N+1), determinism assertion tests, explicit offline-mock or caveat with manual-harness instructions.
- **Pass Threshold**: >= 4
- **Evidence**: Test file review; coverage output if available.

## Open Questions
- [ ] Which test runner should be used? (Spec proposes Vitest for its native ESM + TS support and speed over Jest; defers to implementation task's explicit justfification section.)
- [ ] Is Vitest acceptable, or is Jest required by team policy?
- [ ] Should M1 include an OfflineAudioContext-based integration smoke test (runnable in Node via `web-audio-engine` shim) or is pure unit math + manual harness sufficient?
- [ ] Python package manager for `ml-experiments`: uv vs. poetry vs. plain venv + pip? (Spec defers to implementer choice with justification in ENGINEERING_RULES.md.)
