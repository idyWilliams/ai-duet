# AI Duet Sprint 2.1 Spec: Scheduling Precision and Transport Lifecycle Audit

## Problem
Sprint 2 delivered an audibly-working click track inside a normal music-player shell,
but before adding recorded-waveform backing in M3 we must audit two high-risk areas:

1. The full timing pipeline from `AudioContext.currentTime` through
   `AudioClock → BeatBarScheduler → committed BeatEvent → OscillatorNode.start(when)`
   for precision, duplicate-beat emissions, and past-scheduling bugs.
2. The interaction between Player cleanup (`transport.stop()` drains ALL listeners
   on a SINGLETON transport) and React subscription lifecycle when the Player
   unmounts/remounts or navigates songs.

## Users / Stakeholders
- Human listener: wants clicks to stay on-tempo, no stutter/double-clicks on
  pause/resume/seek/tempo changes, no clicks leaking after navigate away.
- Future M3 implementer: wants a known-correct scheduling baseline so buffered
  phrases align with clicks. If we ship waveform playback with a hidden
  baseline-offset bug, clicks will never line up with the backing.
- React maintainer: wants onMount to always get position/turn updates and
  never lose UI updates across song changes.

## Goals
- Identify and eliminate any defect that would cause scheduled audio to fire at
  the wrong absolute AudioContext time or fire twice for the same beat.
- Eliminate the lifecycle risk where Player cleanup + singleton stop() leaves
  remounted Player with dead position/turn subscriptions.
- Strengthen deterministic unit tests to EXACT scheduling timestamps (±1 ms),
  not just "clicks happened".
- Leave public API and 100 ms / 20 ms / 25 ms tuning constants unchanged unless
  a failing test demonstrates a concrete need.

## Non-Goals (out of scope)
- No AI singing / speech synthesis.
- No microphone input, pitch detection, latency calibration, VAD.
- No recorded backing phrases / waveform playback / M3 scope (this audit is the
  prereq BEFORE that work starts).
- No new UI, design system, or package. No framework change.
- No tap-to-sync, no new scheduler rewrite.
- No copyrighted songs, lyrics, melodies, or recorded copyrighted vocal stems.

## Functional Requirements (rule ACs where binary)

### Scheduling precision
FR-1 `rule`:
Every committed `BeatEvent.scheduledAt` (musical SecondsTime, 0-based from the
transport's logical 0) must map into the native AudioContext timeline via the
formula `audioStartedAtCtxTime + ev.scheduledAt` inside `handleCommittedBeat`,
and the resulting `OscillatorNode.start(when)` value MUST equal the expected
beat's absolute ctx time for the known tempo. Tolerance in tests: 1 ms to allow
branded-time float representation; this validates the calculation, it does NOT
claim physical speaker accuracy.

FR-2 `rule`:
At default 120 BPM 4/4 starting at `ctx.currentTime = T0` on play(): beat index N
(0-based) MUST start at native ctx time `T0 + N * 0.5 s`. The transport's
`pauseCumulativeElapsed` baseline MUST be preserved after a pause so resuming at
time T_pause produces continued beat timestamps `(T_pause - T0) + offset` from
where they left with no drift beyond the same 1 ms tolerance.

FR-3 `rule`:
Seeking to a target musical `elapsed = E` seconds MUST re-derive the baseline so
the next committed beat for beat index `floor((bpm/60) * E)` is scheduled at
`(T_resume) + (beat_index * 60/bpm - E)` absolute ctx time — i.e. the SAME
formula as if we had played through to E naturally. No skipped beats, no
duplicates.

FR-4 `rule`:
No duplicate committed BeatEvents for the same beat ID across consecutive
scheduler ticks. This is already enforced in BeatBarScheduler via
`lastCommittedEmittedBeat`; add a regression test that it holds under stress.

FR-5 `rule`:
`stop()` must silence/cancel pending scheduled clicks (gain → 0 then stop) and
`pause/resume/seek/tempo changes` must not leave previously-scheduled clicks at
their OLD absolute times that would now play at wrong musical positions. Add a
test: after seek(10) while playing at 120 BPM, NO `OscillatorNode.start(when)`
in the recorder has `when < new_baseline_start_time + 10s - 0.02s` (commit
horizon tolerance) AND is a duplicate of a beat we should have already passed.

FR-6 `rule`:
setBpm() during play restarts the scheduler with new clock baseline; NO beat
scheduled to OLD bpm remains enqueued (test: no clicks at old inter-beat
interval after setBpm). Committed events within the commit horizon MAY play out
as expected per AUDIO_ARCHITECTURE.md §Beat/Bar Scheduler rule.

### Listener and React lifecycle
FR-7 `rule`:
A subscriber's `RemoveListener` returned from `onPositionChange/onTurnChange`
MUST remove ONLY that subscriber's callback. It must NOT affect other active
subscribers present on the same singleton transport.

FR-8 `rule`:
`transport.stop()` on the SINGLETON transport MUST NOT drain/clear position/turn
listener arrays. Current code does `this.positionListeners.length = 0; this.turnListeners.length = 0`
which kills subscriptions for any later-mounted Player/UI. Fix: stop() stops
PLAYBACK (scheduler, poller, click nodes, ctx suspend/close, reset turn/elapsed
to initial) but leaves listener registration intact. Add a regression test with
two simultaneous subscribers around stop().

FR-9 `rule`:
After a Player-unmount triggers transport.stop(), mounting Player again
(i.e. subscribing + then calling play()) MUST resume position AND turn updates
to React. Add an injected-dependency integration test that simulates the
subscribe → stop → subscribe → play() lifecycle around a singleton-like
transport instance. Stop must also actually stop pending audio.

FR-10 `rule`:
No duplicate subscriptions across React StrictMode double-effects. The existing
`onPositionChange` / `onTurnChange` return a per-callback unsubscribe, and the
useEffect cleanup calls them — behavior is correct and no change required; add a
test that two sequential subscribe/unsubscribe pairs leave zero listener state
for that callback.

### Cleanup / invariant preservation
FR-11 `rule`:
On every path out of play (pause, stop, seek cleanup), all of these are killed:
positionPollInterval, schedulerBeatUnsub, scheduler internal tickInterval,
pending click nodes silenced+stopped, and (only on stop, not pause) the
AudioContext close() path if supported. Already done; add a test confirming
`stop()` leaves `scheduler === null`, no active intervals recorded by fake
timers, zero pending click nodes still referenced in `pendingNodes`.

## Non-Functional Requirements
NFR-1 `rule`: Keep existing public API shape of `ITransport`, `ClickTrackTransport`,
`useTransport` return type. No new methods/parameters unless a lifecycle fix
requires one; any addition must be strictly additive.
NFR-2 `rule`: No new npm packages / no React/TypeScript/Vite version changes.
NFR-3 `rule`: AudioContext.currentTime remains the only timeline authority;
no new Date.now/performance.now scheduling math.

## Constraints & Dependencies
- Monorepo pnpm 9 / node 20+ / strict TS exactOptionalPropertyTypes.
- Existing artifacts: SPRINT2_FIRST_REAL_PLAYBACK.md (§1 lists baseline state),
  AUDIO_ARCHITECTURE.md §Beat/Bar Scheduler commit-horizon rules.
- Tests must run deterministically — injected fake ctx + vi.useFakeTimers only.
- All scheduling tests must call scheduler.tick() explicitly rather than relying
  on the scheduler's own 25 ms setInterval tick (that ticker would couple fake
  timers unreliably). Use the established `runSchedulerTicks` helper pattern.

## Assumptions
- Tempo changes during playback are rare in real usage (setBpm() from dev slider
  only); committed events within commit horizon are allowed to play out as-is,
  per scheduler spec. Fix scope is: any BEYOND commit horizon scheduled under
  the OLD clock must be cancelled.
- Player.tsx cleanup `transport.stop()` per song change is the desired entry
  point for releasing audio resources; the fix must NOT replace that pattern —
  it must make stop() safe for subscribers on the singleton.

## Open Questions
None; scope is the explicit 6-part objective from the sprint brief.

## Acceptance Criteria
AC-1 `rule`: pnpm typecheck exit 0.
AC-2 `rule`: pnpm test exit 0 with exact new regression tests described above
passing (no skip/xit).
AC-3 `rule`: pnpm build exit 0.
AC-4 `rubric`: Scheduling defect evidence. 3 pt scale. Pass >= 2.
  * 3: BOTH scheduling defects identified in this sprint (double-scheduling on
    pause-internal-stop cancel semantics + seek/setBpm stale-event potential)
    have explicit failing-before-fix tests demonstrating they occurred.
  * 2: 1 scheduling defect has an explicit failing-before-fix test; the other
    audit point has a defensive regression test added.
  * 1: Only high-level pass/fail tests without exact timestamp assertions or
    duplicate-event counting.
AC-5 `rubric`: Lifecycle defect evidence. 3 pt scale. Pass >= 2.
  * 3: Explicit two-subscriber-around-stop() test FAILS before FR-8 fix and
    PASSES after. Remount subscribe→play test exists.
  * 2: stop() no longer drains listeners; regression test confirms other
    subscribers survive stop().
  * 1: No lifecycle tests; fix was hand-applied without proof.
AC-6 `rule`: Honest manual verification section in final report. Unit tests do
NOT claim physical speaker timing accuracy; 1 ms tolerance is explicitly labeled
as calculation validation only.
