# AI Duet Engineering Rules
## Architectural Invariants (11, verbatim from stakeholder spec)
1. The AudioContext timeline is authoritative for audio scheduling; never use wall-clock time for musical scheduling.
2. V1 clock-led mode uses a stable configured tempo and backing/click track. Human analysis provides observations and corrections, not direct ownership of the clock.
3. UI rendering and React state never control real-time audio timing.
4. The Score Follower reports song position, section, phrase and confidence to the Performance Engine.
5. The Performance Engine owns musical decisions and receives clock state, score position, lyrics, melody and analyzer confidence.
6. Use look-ahead rendering, a commit horizon, cancellation/replanning of tentative future plans, and cached vocal fallbacks when confidence is low or synthesis is late.
7. AudioWorklet code must not perform network requests or expensive ML inference.
8. Keep the audio scheduler, mixer, backing-track lane, clock, analyzers, score follower, performance engine and singing engine as clearly defined components with typed interfaces.
9. Calibrate output/input latency and document Bluetooth limitations. Require headphones for the first prototype.
10. Strong typing, explicit error handling, automated tests and measurable latency are mandatory. Avoid any.
11. Song lyrics, melody and recordings must have appropriate usage rights.

## Package Manager + Monorepo Tool Choice
Chosen: **pnpm 9 with pnpm workspaces** (no Turborepo / Nx layer for M0/M1).
Alternatives considered and rejected:
- **npm workspaces**: no phantom-dep protection (critical for enforcing dependency direction rules), slower installs, higher disk use.
- **yarn (berry/v3) workspaces**: PnP mode causes friction with Vite/web-audio tooling; loose node-modules mode loses advantages over pnpm.
- **Turborepo / Nx**: build graphs are trivial in M0/M1 (2 libs + 1 app). Extra orchestration layer added only when CI caching across >4 build tasks proves valuable (M3+).
Rationale summary:
- Strict symlink isolation prevents phantom deps, enforces dependency boundaries (AC-2).
- Fastest installs (p95 comparison benchmarks).
- Content-addressable store saves significant disk if future PyTorch / torch-audio prebuilts are vendored into workspace via npm aux package (unlikely but safe).
- Excellent workspace: protocol, built-in filtering (--filter @ai-duet/web-app), no extra CLI layer.

Python (ml-experiments): **plain venv + pip with hatchling as build backend**. No uv/poetry in M0 to keep toolchain single-discipline per language (JS uses pnpm, Python uses stdlib pip + venv).

## Dependency Approval Log
Every dep must be listed with one-line justification. Add here when you add a package.
### Root devDependencies
- typescript ^5.7.0 — TS strict compiler for all TS packages, required by NFR-1 and architectural invariant #10.
- vitest ^3.0.0 — native ESM/TS test runner; faster than Jest; required by NFR-3 tests rule.
- @types/node ^22.0.0 — Node typings for CLI harnesses and pure math tests.
### @ai-duet/audio-core (deps)
- (none)
### @ai-duet/performance-engine (deps)
- @ai-duet/audio-core workspace:* — only allowed dep per boundaries.
### @ai-duet/web-app (deps)
- react ^18.3.1 — mandated by stack.
- react-dom ^18.3.1 — mandated by stack.
- react-router-dom ^6.28.0 — minimal standard client-side routing for 3 pages (home/song/player); weighed against in-app state-router; react-router wins for URL shareability + deep links in future.
- @ai-duet/audio-core workspace:* — ITransport & types.
- @ai-duet/performance-engine workspace:* — future integration (imported but unused in M1, buildable only).
### @ai-duet/web-app (devDeps)
- @types/react, @types/react-dom — mandated typings.
- @vitejs/plugin-react ^4.3.0 — React JSX transform for Vite.
- vite ^6.0.0 — build tool for modern React app.
- @testing-library/react, jsdom, @testing-library/jest-dom — minimal React unit test support for StubTransport + useTransport hook; do not add RTL to lib packages.
### ml-experiments Python
- hatchling — PEP 517 build backend; no runtime deps.

## Typing Rules
- strict true, noImplicitAny true, strictNullChecks true, exactOptionalPropertyTypes true, noUncheckedIndexedAccess true — everywhere.
- No any. Use unknown + type guard when input shape is truly unbound.
- Prefer branded/opaque types for time units: SecondsTime, BeatTime, BarTime, AudioFrameTime, Confidence (0..1).
- Public fallible APIs return Result<T, E> = { ok:true, value:T } | { ok:false, error:E }; only truly unrecoverable internal panics throw typed subclasses (ClockError, ScheduleError, ...).

## Error Handling
- Typed discriminated errors per domain: ClockError | ScheduleError | RenderError | ScoreError | TransportError.
- Never silent catch (catch blocks must either handle explicitly or re-throw; console.error alone counts as handling only if paired with UI banner / metric).
- AudioWorklet ↔ main message pipe: every error message has discriminable type; main thread logs + surfaces non-fatal banners.

## Testing
- Runner: Vitest. Use vitest globals in web-app (jsdom env).
- Coverage target ≥ 80% line on lib packages (audio-core, performance-engine). Coverage on web-app UI shell: deferred to M2, but ITransport behavior unit-tested (StubTransport.test.ts).
- For audio math: deterministic, numeric tolerance (1e-9 seconds). NO snapshot tests for audio math.
- M1 tests use injected time providers, no real AudioContext. Document the harness limitation.
- Measure latency hooks: IClock.probeNow() returns ProbeReading { audioTime, beat, bar, wallClockReceivedAt }. Scheduler must log (scheduledAt, actualTick, delta). In M2, wire to prometheus/console metrics.

## Latency Measurement Process
Each PR touching scheduling: run M1 determinism tests + M2 (future) end-to-end loopback harness, record p50/p95 of: (actualPlaybackTime - scheduledAudioTime) per lane.

## Content Licensing Rule
Before adding song/lyrics/melody/recording assets:
1. Confirm public-domain or written license.
2. File docs/LICENSE-THIRD-PARTY.md with source + terms.
3. Only then commit the asset.
No copyrighted MIDI, lyrics snippets, or melody transcriptions from commercial songs may be checked in — not even as "examples" in tests.

## UI / React Rules
- React renders what audio tells it; never the reverse.
- React never computes beats, turn state, or scheduling math from scratch. It subscribes to typed observables / listeners from ITransport and displays the values.
- Transport commands (play/pause/seek) are typed method calls on ITransport, returning Result<...>.
- No waveforms, no mixers, no multi-track in UI shell. If an engineering debug view is needed, put it behind a ?dev=1 flag that is hidden by default (M3+).
