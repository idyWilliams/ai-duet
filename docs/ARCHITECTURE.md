# AI Duet Architecture
## Layered Architecture
- **Package layer** (from low to high):
  1. `@ai-duet/audio-core` — typed low-level audio building blocks (clock, scheduler, mixer, lanes, analyzers, score follower types + M1 implementations; ITransport interface + stub).
  2. `@ai-duet/performance-engine` — high-level musical decisions (IPerformanceEngine, ISingingEngine interfaces + types; M1 = interfaces only).
  3. `@ai-duet/web-app` — consumer React UI (home / song / player; M0 = shell with mock data + stub transport; M1 = shell + stub).
  4. `@ai-duet/ml-experiments` — Python/PyTorch R&D only (no TS coupling).
## Dependency Direction (enforced by pnpm workspaces)
audio-core ← performance-engine ← web-app. audio-core cannot import performance-engine or web-app. performance-engine cannot import web-app. ml-experiments is independent.
## Component List with Typed Interfaces (audio-core + performance-engine)
- IClock, IBeatBarScheduler, IAudioScheduler, IMixer, IBackingTrackLane, IAnalyzer, IScoreFollower, ITransport (audio-core).
- IPerformanceEngine, ISingingEngine, supporting: PlanHorizon, PhraseTurn, RenderedVocal (performance-engine).
## Data Flow Pipeline
Clock → Score Follower (pos/section/phrase/confidence) → Performance Engine (consumes clock+score+lyrics+melody+confidence, emits tentative plans mutable outside commit horizon, emits committed plans frozen inside horizon) → Singing Engine (renders committed plan → RenderedVocal OR returns error → cached fallback selected by Perf Engine) → Audio Scheduler (enqueues RenderedVocal onto Mixer lanes at exact AudioContext time) → Mixer sums lanes → speakers.
## Look-Ahead + Commit-Horizon Design
- lookAhead default 100ms: window within which Perf Engine proposes tentative plans.
- commitHorizon default 20ms: line inside which plans freeze, render MUST complete or fallback fires.
- Tentative plans beyond commitHorizon are cancellable/replaceable.
## Cached Vocal Fallbacks
Triggers: score follower confidence < threshold, singing render timeout, singing render error. Fallback library: pre-authored RenderedVocal buffers per phrase (M5).
## Error Surfaces
Per-module typed errors: ClockError, ScheduleError, RenderError (RenderTimeout|Rejected|QualityLow), ScoreError, TransportError (NotImplemented|AudioContextUnavailable|SeekOutOfRange). Main-thread boundary catches and surfaces via UI as friendly inline banners (not crashes).
## Feasibility Risks (7+, each with mitigation sketch)
- R1 End-to-end latency budget: singing render must fit within (phrase_lead_time - commitHorizon - mixer_overhead). Mitigation: benchmark every build, enforce p95 < 80% phrase time, cached fallbacks.
- R2 Singing synthesis render time vs look-ahead: worst-case synth slower than phrase. Mitigation: small models, batched phrases, aggressive fallbacks.
- R3 AudioWorklet ↔ main thread comms overhead: serialization/postMessage jitter. Mitigation: batched plan messages, SharedArrayBuffer if allowed, measure.
- R4 Bluetooth audio drift: BT has no AudioContext-synced timestamps; delay varies 40-150ms. Mitigation: V1 REQUIRES wired headphones; future drift compensator uses live-mic cross-correlation with backing.
- R5 Score follower confidence on real singing: off-key / quiet / noise. Mitigation: conservative thresholds → fall back to clock-led phrase timing.
- R6 Licensing for V1 song + melody + lyrics. Mitigation: select pre-vetted public-domain song and document rights before commit.
- R7 Mobile Web Audio support: iOS Safari quirks (needs user gesture to resume AudioContext, sample-rate mismatches). Mitigation: M2+ iOS-specific harness, explicit tap-to-start UI.
## Singing Engine Benchmark (per-bar render time)
Benchmark spec: Render ONE 4-bar phrase (4/4, 120 BPM, 8 seconds wall) → 48kHz 32-bit float mono buffer. Repeat N=20. Measure wall time from request submission to RenderedVocal.buffer available. Report p50 / p95 / p99. PASS THRESHOLD: p95 < 0.80 × phrase_duration (6.4 s for 8s phrase; i.e. p95 < 6.4s). Rationale: leaves 20% slack for scheduling, mixer, jitter.
