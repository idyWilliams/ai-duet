# Sprint 2.1 Tasks — Scheduling Precision & Lifecycle Audit

## Task 1: Full timing-path code audit & document findings
Status: in_progress
Priority: high
Depends: (none)

Objective: Trace ctx.currentTime → clock → scheduler → committed beat →
OSC.start(when) and record exact behavior before changing any code. Re-read
ClickTrackTransport.handleCommittedBeat, stopPlayingInternals cancelFuture,
BeatBarScheduler.tick event dedup, AudioClock.now(). Produce written notes
of exact behavior.

Test Requirements (TRs):
- TR-1a `rule`: Review ClickTrackTransport.stopPlayingInternals call sites.
  Identify every path that calls it, whether rememberPauseOffset is set, and
  whether cancelFuture(false) CANCELS only events BEYOND commit horizon per
  scheduler spec. Result recorded here.
- TR-1b `rule`: For the formula in handleCommittedBeat:
  `scheduledAtCtxTime = audioStartedAtCtxTime + ev.scheduledAt`. State in
  plain English: What does ev.scheduledAt actually mean? (is it 0-based from
  clock start = pauseCumulativeElapsed? Or from ctx.currentTime directly?)
  Compute for a known concrete scenario: initial ctx=10, pauseCumulativeElapsed=0,
  bpm=120. What value do we EXPECT for scheduledAtCtxTime of beat 0? beat 1?
  Record those numbers as gold values for Task 3's exact tests.

Completion Evidence: findings inline here + in final report.

## Task 2: Prove FR-8 lifecycle defect with a test, then fix stop() listener drain
Status: pending
Priority: high
Depends: Task 1

Objective: stop() currently does positionListeners.length = 0 / turnListeners.length = 0
on a singleton transport. Two subscribers: when one causes stop() (e.g.
Player cleanup), the other's subscriptions are dead forever. Remount Player →
new subscribe adds back BUT any OTHER subscriber (if one existed) loses updates
AND stop() is called on every song change, so every song change is a hazard
for future subscribers added.

Test Requirements (TRs):
- TR-2a `rule`: New failing test (written first). Steps:
  (1) Create ClickTrackTransport instance. (2) Subscribe subA to position,
  subB to turn, both with counters. (3) play(), advance 1 beat, confirm both
  counters incremented ≥1. (4) Call stop(). (5) Subscribe subC to position.
  (6) play() again, advance 2 beats, run poller. (7) Assertion: subC counter
  increments. This should PASS TODAY but TR-2b below FAILS.
- TR-2b `rule`: STRONGER assertion — subA is also still live after stop() and
  after second play() call (no spurious .length=0 drain). Before fix subA=0;
  after fix subA>0. This is the regression test.
- TR-2c `rule`: stop() STILL resets _currentSeconds=0, _currentTurn='human',
  kills scheduler, stops clicks, suspends+closes ctx. Verify in test after
  fix: `currentSeconds()==0 && currentTurn()=='human'` && scheduler null
  && wasSuspended && wasClosed.
- TR-2d `rule`: Seek/pause/play paths do NOT drain listeners (they never did
  today; add a no-regression test for one path to be explicit).

Fix description (smallest justified change):
Replace in ClickTrackTransport.stop():
  `this.positionListeners.length = 0; this.turnListeners.length = 0;`
with just deleting the two lines. Stop stops playback. If a future "fully
destroy transport" primitive is needed, add a separate dispose()/close() API
and mark it separately. For the current singleton contract: stop = stop audio,
reset elapsed, close the audio context so the next play() recreates it, but
leave subscriber list alone because stop() is a per-session not per-process
operation in the Player's effect cleanup usage pattern.

Completion Evidence: commit with both test pass, TR-2b failure recorded on the
"before-fix" run (run test once before code change, capture FAIL output, then
fix).

## Task 3: Exact timestamp tests — prove FR-1, FR-2, FR-3, FR-4 scheduling
Status: pending
Priority: high
Depends: Task 2 OR independent

Objective: Replace current approximate "≥ 1 beatOne click" tests with exact
timestamp math for the committed-beat→OSC.start(when) pipeline. Expose a new
fake ctx field: `scheduledClicks: Array<{ hz: number; startedAt: number;
stoppedAt: number; musicalBeatIdxFromClockStart: number? }>` (or derive beat
idx from startedAt - baseline).

Test Requirements (TRs):
- TR-3a `rule`: EXACT TIMESTAMP TEST #1 (play from 0, 120 BPM). Scenario:
  ctx.currentTime starts at T0 = 10.0. play() at that instant → compute
  `audioStartedAtCtxTime = 10.0`. Expose committedBeat IDs 0..5. For each
  beat N ∈ {0,1,2,3,4,5}, the scheduled start MUST equal
  `10.0 + N * 0.5` exactly (to 1 ms tolerance, float). Add test: for every
  recorded osc in createdOscs, bucket by startedAt within 1 ms of expected;
  assert each expected bucket has exactly one osc, no extras, no missing.
- TR-3b `rule`: EXACT TIMESTAMP TEST #2 (pause then resume). Same 120 BPM,
  T0=0. play; advance ctx + scheduler ticks to exactly elapsed=1.2 s; pause.
  This should record pauseCumulativeElapsed=1.2 s. Advance wall fake timers
  another 10 s (ctx is suspended in real impl; in fake ctx, currentTime stays
  constant during "suspend" semantics — we already captured pauseElapsed).
  Resume play(). The next beat after 1.2 s is beat index
  ceil(1.2 s / 0.5 s/beat) = ceil(2.4) = beat index 3 at musical time 1.5 s,
  absolute ctx time = NEW audioStartedAtCtxTime_2 + 1.5 = ... which equals
  (current_resume_ctx_time - 1.2) + 1.5 = resume_ctx_time + 0.3. Verify
  actual scheduled osc.startedAt within 1 ms of that expected.
- TR-3c `rule`: SEEK EXACT TIMESTAMP TEST. play 120 BPM from 0, advance to
  ~elapsed=2.0 s, then seek(10.0). After seek, play continues from the new
  baseline. Expected next beat: floor((120/60)*10.0) = beat 20 at musical
  time = 20 * 0.5 = 10.0 s — exactly at seek target (if integer-beat aligned
  we land on beat; otherwise just after). Prove that NO click is scheduled
  BEFORE audioStartedAtCtxTime_new + 10.0 - commitHorizon (i.e. no stale beats
  from old timeline slip through).
- TR-3d `rule`: NO DUPLICATE CLICKS test. Run the test scenario for
  TR-3a but run scheduler ticks at 1 ms intervals (faster than the 25 ms
  default but valid, and ensures we stress the lastCommittedEmittedBeat
  dedup in BeatBarScheduler.tick). After run, count createdOscs at each
  expected beat timestamp bucket; assert every bucket has EXACTLY count=1
  880 Hz click at beat 0 and exactly count=1 440 Hz click at beats 1..5.

Implementation note: For all of these, the current 100 ms look-ahead causes
many future beats to be committed inside a single scheduler tick once the
window covers them. The test MUST still produce EXACTLY one click per unique
musical beat index inside the dedup tolerance.

## Task 4: Scheduling-after-internal-stop defects (FR-5, FR-6)
Status: pending
Priority: high
Depends: Task 3

Objective. Two risks in ClickTrackTransport:
(A) In setBpm(playing) → seek(currentSeconds). seek(wasPlaying=true) calls
stopPlayingInternals(true) then play() again. stopPlayingInternals calls
scheduler.cancelFuture(false) which by spec removes only events beyond
commit horizon. But in the current ClickTrackTransport, we are NOT tracking
committed beat IDs across the stop()/start() boundary, so it's possible a
beat committed RIGHT BEFORE the boundary gets fired TWICE: once from the
old scheduler (if we only cancelFuture and stop but the audio graph nodes
were already scheduled), ONCE from the new scheduler. Because the audio
nodes for the old committed click were already posted as osc.start(when)
into the audio thread, and the new scheduler replays the beat from scratch
with a new osc.start(when') at the same musical time. This is the DOUBLE
CLICK bug on setBpm() / seek() while playing.
(B) Similar for seek() with big jumps: clicks already-scheduled from prior
timeline remain in `pendingNodes` audio graph until stopAllPendingClicks()
runs. Today stopPlayingInternals DOES call stopAllPendingClicks, so this is
already silenced — but it's not PROVEN by a test.

Test Requirements (TRs):
- TR-4a `rule`: setBpm() DOUBLE CLICK REGRESSION TEST. Scenario: start at
  120 BPM, play for exactly 1.0 s elapsed (beat 2 passed), then call
  setBpm(180) while playing. Before fix: inspect createdOscs timestamps at
  the musical times that fall within commit horizon at time of setBpm.
  After fix: exactly ZERO duplicate startedAt timestamps (within 1 ms of
  each other) for any scheduled click bucketed to the same absolute ctx
  time by the baseline math. Even if old committed events play, the NEW
  scheduler must NOT emit a beat the old one already sent (we can't
  actually un-schedule already-OSC.started nodes; the CORRECT behavior
  is that if a beat fell within commit horizon it plays ONCE from the
  prior schedule, and the new scheduler starts AFTER it). The test is an
  upper-bound: total duplicate pairs = 0 or ≤ 1 pair exactly at the
  commit boundary (allowed per scheduler spec).
- TR-4b `rule`: SEEK FAR JUMP NO STALE CLICKS. Play 120 BPM, get clicks
  flowing. Call seek(seconds(30)) while playing. After one scheduler
  tick, inspect createdOscs entries startedAt. Assert that every
  startedAt in the test is EITHER ≤ pre-seek-baseline + 30 s + commitHorizon
  (i.e. belongs to timeline before jump, already past — but stopped via
  stopAllPendingClicks), OR ≥ (post-seek baseline). No entries at times
  like baseline_prev + 31 s would exist; if they do, they're stale from
  old timeline. Fix: already exists; TR-4b is the regression proof.
- TR-4c `rule`: stop() SILENCES PENDING CLICKS. Play 120 BPM, schedule a
  bunch of clicks into future, call stop(). For every recorded osc/stop,
  ensure that stopAllPendingClicks wrote setTargetAtTime(0, now, 0.001) to
  EACH recorded gain node — fake ctx must record per-node call history
  (today createdGains records setTargetCalls globally, not per-node;
  upgrade the fake ctx to record per-gain setTargetCalls array so the
  test can assert every pending node got silenced).

## Task 5: Remaining lifecycle tests (FR-9 double-effect subscribe safety)
Status: pending
Priority: medium
Depends: Task 2

Objective: Simulate React StrictMode double-effect (mount → unmount → mount
quickly) around useTransport subscription semantics without rendering React.

Test Requirements (TRs):
- TR-5a `rule`: SIMULATE STRICT DOUBLE EFFECT. On one ClickTrackTransport
  instance: (1) subscribe posCb1, turnCb1; (2) immediately call both
  unsubscribe closures (effect cleanup re-run on strict); (3) subscribe
  posCb1 AGAIN with same callback reference, turnCb1 AGAIN. (4) play,
  advance 1 poll interval. Assert posCb1 called exactly once per poll
  (not duplicated), turnCb1 called once per turn. Prove no leak of
  duplicate listeners from leftover unsubs.
- TR-5b `rule`: SONG CHANGE LIFECYCLE. (1) Player1 subscribes to shared
  transport, play → song A plays, updates flow. (2) Simulate song A
  unmount: Player1 calls its unsubs + calls transport.stop(). (3) New
  Player2 subscribes on SAME transport, calls play. Assert Player2's
  position/turn counters increment. (4) ALSO if Player1 forgot to
  unsubscribe (worst case, leaked callback), stop() must NOT have
  cleared that listener (Task-2 fix) — but Player1 callbacks are, by
  contract, still-callable-no-op React setters on unmounted component,
  which are safe to invoke, no-op via React's detached setters. Assert
  no crash and no exceptions thrown.

## Task 6: Run typecheck/tests/build and capture evidence
Status: pending
Priority: high
Depends: Task 2, 3, 4, 5

Objective:
```bash
cd /Users/mac/Documents/ai-duet && pnpm typecheck 2>&1 | tee out/typecheck.log
cd /Users/mac/Documents/ai-duet && pnpm test      2>&1 | tee out/test.log
cd /Users/mac/Documents/ai-duet && pnpm build     2>&1 | tee out/build.log
```

Test Requirements:
- TR-6a `rule`: pnpm typecheck EXIT 0, 0 TS errors.
- TR-6b `rule`: pnpm test EXIT 0; audio-core exact counts (old 46 + new
  tests this sprint ≥ 6 new → ≥ 52 tests in audio-core); web-app tests
  8 pass unchanged.
- TR-6c `rule`: pnpm build EXIT 0, web-app vite bundle grows less than
  5 kB gzip JS (new code is test-only mostly, no new deps).
- TR-6d `rubric`: Audibility note. 2 pt scale. Pass >=1.
  * 2: §2 manual audibility procedure from SPRINT2 report is re-executed
    by a human after code changes, clicks heard, double-click/seek-click
    behavior marked PASS/FAIL with specific notes.
  * 1: Honest explicit note that human audibility NOT re-performed in
    sandbox, automated tests pass calculation-only.
  * 0: Falsely claims sample-accurate physical clicks based solely on
    unit tests.

Completion Evidence: captured verbatim logs + final report items 1..6 per
user brief.

## Task 7: Independent review pass + final report
Status: pending
Priority: high
Depends: Task 6

Objective: Independent review of spec ACs and report items.

Test Requirements:
- TR-7a `rule`: Reviewer separately re-runs `pnpm test` and confirms EXIT 0.
- TR-7b `rule`: Reviewer separately confirms the FR-8 listener-drain code
  path in stop() is fixed (i.e. search positionListeners.length in
  ClickTrackTransport.ts → 0 hits).
- TR-7c `rule`: Report includes the user's required 6 sections: (1) defects
  found, (2) files changed & why, (3) new regression tests & proof, (4)
  exact commands & results, (5) still-requires-human items, (6) M3 ready?
