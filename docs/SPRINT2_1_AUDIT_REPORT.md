# Sprint 2.1 Audit Report — Scheduling Precision & Transport Lifecycle

**Date:** 2026-10-04
**Repository:** `ai-duet` (pnpm 4-package workspace)
**In-scope packages:** `@ai-duet/audio-core`, `@ai-duet/web-app`
**Public API preserved:** Yes. No changes to `ITransport`, `useTransport`, `Player.tsx` UI, scheduler tuning constants (100 ms lookAhead / 20 ms commit / 25 ms tick).

---

## 1. Confirmed Defects (3 — all reproduced with failing tests before fix)

| # | Severity | FR | Title | Root Cause | Evidence (before fix) |
|---|---|---|---|---|---|
| **D1** | High | FR-8 | `stop()` drains ALL subscriber listeners on the singleton transport per unmount/song-change | [ClickTrackTransport.stop()](file:///Users/mac/Documents/ai-duet/packages/audio-core/src/transport/ClickTrackTransport.ts#L273-L294) L291-292 ran `positionListeners.length = 0; turnListeners.length = 0;` | TR-2b FAIL: "expected 4 to be greater than 4" at `__tests__/Sprint2_1_Regression.test.ts:219`. Both subscriber A (not unsubscribed) & subscriber B (resubscribed) stopped receiving position callbacks after stop()+replay. Triggered by Player.tsx cleanup calling `transport.stop()` on every song unmount. |
| **D2** | Critical | FR-1 | Oscillator timestamps **double-shift** when `AudioContext.currentTime ≠ 0` at `play()` start → 0 clicks land at expected beat positions | [ClickTrackTransport.play()](file:///Users/mac/Documents/ai-duet/packages/audio-core/src/transport/ClickTrackTransport.ts#L188-L189) `timeProvider = () => ctx.currentTime` (raw native) combined with clock `startAudioTime = 0` → handleCommittedBeat L411 `scheduledAtCtxTime = audioStartedAtCtxTime + ev.scheduledAt` adds T0 a second time. Example: T0=10 → beat N scheduled at `20 + N*0.5` instead of `10 + N*0.5`. | TR-3a FAIL: every bucket at positions `10.0, 10.5, 11.0, 11.5, 12.0, 12.5, 13.0` had `count=0`. First fail n=0: "expected 0 to be ≥ 1" `__tests__/Sprint2_1_Regression.test.ts:334`. |
| **D3** | Critical | FR-5/6 | `seek(wasPlaying=true)` & `setBpm(playing)` leave **scheduler null forever** so clicks silently stop after the operation | [seek()](file:///Users/mac/Documents/ai-duet/packages/audio-core/src/transport/ClickTrackTransport.ts#L247-L249) calls `stopPlayingInternals(true)` **without** setting `_isPlaying=false` → subsequent `play()` at L264 early-returns `ok` on its first-line guard `if (this._isPlaying) return ok(undefined);` → scheduler was nulled and never re-instantiated. setBpm() calls seek(currentSeconds) internally → same path. | TR-3c+4b FAIL: post-seek scheduler existence assertion "expected null not to be null" `line 481`. TR-4a FAIL: identical post-setBpm at `line 559`. Diagnostic confirmed: scheduler null synchronously immediately after `play()` returned with `ok=true`. |

**Defects NOT found (tests pass against unmodified):**
- BeatBarScheduler duplicate emission: TR-3d stress 3 s × 1 ms ticks → 1 click/beat exact.
- React StrictMode double-effect duplicate callbacks: TR-5a passes.
- `stopAllPendingClicks` per-node silence: already correct (iterates pendingNodes, calls gain.setTargetAtTime(0,…) per node + osc.stop()).

---

## 2. Files Changed & Why

### Production (3 minimal surgical edits inside ClickTrackTransport only)

| File | Change | Lines | Purpose |
|---|---|---|---|
| [ClickTrackTransport.stop()](file:///Users/mac/Documents/ai-duet/packages/audio-core/src/transport/ClickTrackTransport.ts#L273-L294) | **Deleted 2 lines** `this.positionListeners.length = 0; this.turnListeners.length = 0;` | 2 deleted | Fix D1. stop() = stop audio & reset turn/elapsed, NOT unsubscribe observers. Stop STILL: kills scheduler, cancels future tentative events, silences every pending individual gain node, suspends+closes ctx, resets turn=human/elapsed=0, emits final position. Listener registration survives. Public `ITransport.stop()` signature preserved. |
| [ClickTrackTransport.play()](file:///Users/mac/Documents/ai-duet/packages/audio-core/src/transport/ClickTrackTransport.ts#L186-L192) | Added `const baseCtxBaseline = this.audioStartedAtCtxTime;` then changed `timeProvider = (): number => ctx.currentTime` → `(): number => ctx.currentTime - baseCtxBaseline` | 1 new + 1 wrapped lambda | Fix D2. Aligns `AudioClock.now()` → **musical elapsed seconds** (0 = song start), matching the clock's own `startAudioTime = pauseCumulativeElapsed` anchor. Final OSC timestamp: `audioStartedAtCtxTime + beatToSeconds(beatIdx) = exactly T0 + musical_seconds_of_beat`. Matches AUDIO_ARCHITECTURE.md rule: single timeline authority = AudioContext.currentTime. `startAudioTime` formula & `audioStartedAtCtxTime` formula unchanged. |
| [ClickTrackTransport.seek()](file:///Users/mac/Documents/ai-duet/packages/audio-core/src/transport/ClickTrackTransport.ts#L245-L250) | Inside `if (wasPlaying) {`, inserted `this._isPlaying = false;` immediately BEFORE the `stopPlayingInternals(true);` call | 1 inserted line | Fix D3. Mirrors identical existing ordering in `pause()` line 236 which sets `_isPlaying=false` before stopPlayingInternals (pause was correct; seek was missing it). Ensures the follow-up `play()` call at line 264 does NOT hit its early-return guard → actually instantiates scheduler/clock/beat-subscription/poller. |

### Files intentionally NOT changed
- `scheduler/BeatBarScheduler.ts` — dedup via `lastCommittedEmittedBeat`, commit-horizon boundary, `cancelFuture(false)` tentative-only removal all correct. 15 existing tests all 0-regression.
- `clock/AudioClock.ts` — `now() = pure timeProvider passthrough`. `beatToSeconds/secondsToBeat` piecewise tempo math is consistent. 20 existing tests all 0-regression. Math correctly applied by caller after provider coordinate correction.
- `transport/types.ts` — public `ITransport` interface byte-for-byte identical.
- `web-app/src/audio/useTransport.ts` + `pages/Player.tsx` — subscription cleanup already uses returned RemoveListener closures. No duplication, no stale-closure issues (TR-5a/5b pass). React code untouched.

### Test files (1 new regression suite)
| File | Purpose |
|---|---|
| [Sprint2_1_Regression.test.ts](file:///Users/mac/Documents/ai-duet/packages/audio-core/__tests__/Sprint2_1_Regression.test.ts) | 13 deterministic tests using injected fake AudioContext (with per-osc id + startedAt/stoppedAt/Hz recorders + per-gain setTargetAtTime(0,…) call tracking) + explicit `scheduler.tick()` calls + `vi.useFakeTimers()` poller advances. 1 ms `CALC_TOLERANCE_MS` labeled explicitly as *calculation-only tolerance*, not speaker accuracy. |

---

## 3. Regression Tests & Proof

**CALC_TOLERANCE_MS = 0.001 s explicitly labeled as floating-point calculation validation, NOT physical speaker / DAC accuracy (see Section 5 for human listening checks).**

| Test ID | Proves | Assertions | Before | After |
|---|---|---|---|---|
| TR-2b | 2 subs around stop()+replay → both continue receiving updates, no listener drain (D1) | `subBPosCount > subBAfterFirstRun` AND `subAPosCount > subAAfterFirstRun` after 2nd 200 ms poll | ❌ D1 FAIL: 4 not > 4 | ✅ PASS |
| TR-2c | stop() resets turn/elapsed, kills scheduler, suspends+closes ctx — no drain required to pass | turn=human, elapsed=0, scheduler=null, `ctx.wasSuspended() && ctx.wasClosed()` | ✅ PASS | ✅ PASS |
| TR-2d | seek/pause does NOT drain sibling subscribers | both subs' counts increased ≥1 post operation | ✅ PASS | ✅ PASS |
| TR-3a | **Non-zero CTX.currentTime exact scheduling**: T0=10, 120 BPM → beat N click *exactly* at `10.0 + N*0.5 ±1 ms` native ctx time. Beat-1 of bar = 880 Hz, other = 440 Hz. | n=0..6 bucket counts ≥ 1 each; beat-1 Hz == 880; other beats Hz == 440 | ❌ D2 FAIL: all buckets count=0, n=0 "expected 0 ≥ 1" | ✅ PASS |
| TR-3b | Pause at 1.2s → 10s wall suspension → resume. First resumed beat at the correct clock-anchored baseline position (next beat after resume start). Matches the `startAudioTime = pauseCumulativeElapsed` clock semantics: first beat 0 in new clock maps to musical 1.2 → ctx time = `resume_ctx_T - pauseCum + startAudioTime = resume_ctx_T` exactly. | ≥ 1 osc started within 50 ms of `expectedCtxTimeFirst (resume T)` OR `expectedCtxTimeNext (beat 3 at 1.5)`. | ❌ D2 FAIL + timer-short: elapsed at pause 0 instead of 1.2. After test-timer fix, still fails because D2 off by T0=10. | ✅ PASS |
| TR-3d | Stress 3s × 1 ms ticks at 120 BPM → **NO duplicate clicks** emitted across consecutive scheduler ticks | n=0..6 beat buckets each EXACTLY count=1 | ✅ PASS (scheduler dedup correct) | ✅ PASS |
| TR-3c + TR-4b | seek(30s) mid-play: (a) scheduler re-created & non-null, (b) ZERO clicks in timeline gap `[oldTimelineCutoff, newTimelineStart]`, (c) NEW timeline's first committed beat exists at correct `new_audio_started + floor(30/beatDur)*beatDur` | 3-part assertion: sched≠null, ∄ osc in gap window, ≥ 1 matching osc at new expected ctxTime | ❌ D3 FAIL: "expected null not to be null" at sched after seek | ✅ PASS |
| TR-4c | stop() **individually silences EVERY pending click gain node** via its own `gain.setTargetAtTime(0, safeNow, 0.001)` (not just bus stop). Uses bpm 60 + lookAhead 3 s + advance 2.5 s to build ≥ 5 pending nodes. | pendingNodes.length ≥ 5; every gain id ≤ pendingCount appears in `gainsWithSilenceCall(safeNow)` set | ❌ Test-infra only: advance too short → 4 < 5. After test window size increase → prod already correct | ✅ PASS |
| TR-4a | setBpm(180) mid-play: scheduler recreated non-null. ≤ 1 duplicate click pair at commit-horizon boundary (committed-to-audio-thread events CANNOT be recalled → single boundary glitch allowed). | sched≠null; duplicatePairs < 5 ms apart ≤ 1; currentBpm == 180 | ❌ D3 FAIL: "expected null not to be null" post setBpm | ✅ PASS |
| FR-11 | After stop(): no leaked setInterval timers, zero orphan pendingNodes, scheduler null. | active intervals == 0; pendingNodes empty; scheduler == null | ✅ PASS | ✅ PASS |
| TR-5a | React StrictMode simulation: subscribe → unsubscribe → resubscribe → NO duplicate callbacks per 33 ms poll (exactly 1 pos update / window) | duplicate-fire ratio == 1 after 66 ms window | ✅ PASS | ✅ PASS |
| TR-5b | Song-change lifecycle: Player unmount `stop()` → new mount subscribe → `play()` → position+turn callbacks correctly resume. Simulates Player.tsx's exact useEffect cleanup. | pos updates ≥ 2 after play; initial turn == human | ✅ PASS | ✅ PASS |
| FR-7 | Subscriber independence: unsubscribing B never affects A (its own RemoveListener closure only removes its index from the array). | After B unsub: next 33 ms poll → count A increases ≥ 1; B count stays frozen | ✅ PASS | ✅ PASS |

---

## 4. Exact Commands & Results (all from `/Users/mac/Documents/ai-duet`)

### 4a. Before-fix defect evidence (unmodified production, 6/13 FAIL)
```
$ cd packages/audio-core && pnpm vitest run __tests__/Sprint2_1_Regression.test.ts --reporter=verbose
→ Test Files 1 failed | Tests 6 failed (3 real-defect + 3 test-infra threshold) / 7 passed / 13 total
Logs: /tmp/sprint21_beforefix.log
```

### 4b. After-fix audio-core full suite (59/59, 0 regressions)
```
$ cd packages/audio-core && pnpm vitest run --reporter=verbose
→ 4/4 files, 59/59 tests passed in 1.08 s:
   AudioClock 20, ClickTrackTransport 11, Sprint2_1_Regression 13, BeatBarScheduler 15
```

### 4c. Repo typecheck (EXIT=0, 3/4 packages tsc --noEmit)
```
$ pnpm typecheck
packages/audio-core       tsc --noEmit  → Done
packages/performance-engine tsc --noEmit → Done
packages/web-app          tsc --noEmit  → Done
EXIT=0
Logs: /tmp/sprint21_typecheck.log
```

### 4d. Repo test (EXIT=0, 67/67 substantive non-noop tests)
```
$ pnpm test
packages/audio-core       vitest run     → 59/59
packages/performance-engine exit 0       → Done (existing no-op convention)
packages/web-app          vitest         → 8/8 StubTransport
Total substantive: 67/67 pass
EXIT=0
Logs: /tmp/sprint21_test.log
```

### 4e. Repo build (EXIT=0, web-app vite production bundle output)
```
$ pnpm build
packages/audio-core       tsc -p tsconfig.json --outDir dist → Done
packages/performance-engine tsc -p tsconfig.json --outDir dist → Done
packages/web-app          tsc -b && vite build
   vite v6.4.3 production build (8.92 s):
     dist/index.html                   0.39 kB
     dist/assets/index-*.css           2.56 kB │ gzip 0.97 kB
     dist/assets/index-*.js          190.98 kB │ gzip 61.35 kB
EXIT=0
Logs: /tmp/sprint21_build.log
```

---

## 5. Human Browser Verification (Chrome on real macOS, real Player UI from Sprint 2)

**Honesty disclaimer:** Unit tests validate calculation/pipeline only. 1 ms tolerance = floating-point math, NOT speaker/DAC accuracy. All 8 below require a human ear + real tab lifecycle; no unit test substitutes.

| ID | Manual Check | Why unit tests don't cover |
|---|---|---|
| L1 | Initial play at 120 BPM → count 20 clicks in 10 s at stable 0.5 s cadence, 0 drift | Real Web Audio render quantum jitter / audio thread scheduling |
| L2 | Page idle 10 s (let real ctx.currentTime drift) → click ▶. First click within ~250 ms, then 0.5 s cadence. **Critical D2 validation** — before fix, ALL beats scheduled T0 s = 10 s too far in future → total silence. | Real CTX idle advance not captured by fake-tick deterministic test. |
| L3 | Play 1.5 s → Pause 3 s → Resume. 4th click within ~250 ms of resume, NOT reset to beat-0 click. | Validates pauseCumulativeElapsed baseline against real audio thread. |
| L4 | **Play mid-song → drag seek to 45 s → clicks resume within 250 ms (not silence forever). Critical D3 validation.** Before fix clicks died permanently. | Unit test validates scheduler re-creation; human validates real audible audio emerges after UI drag. |
| L5 | **Play → BPM 120→180. Cadence halves, clicks continue (≤ 1 single boundary double-click glitch at commit horizon). Critical D3 validation.** Before fix clicks died forever. | Fake ctx can't render the actual commit-horizon residual beat. |
| L6 | Bar-line (880 Hz) click is distinct from 440 Hz. On stop(): no tail "pop" from decaying envelope. 440 vs 880 pitch distinction by ear. | Real audio rendering only; stopAllPendingClicks envelope needs ear validation. |
| L7 | Play → switch browser tab for 15 s → switch back. Position UI still updates, clicks still firing, turn still cycles human→ai every 8 bars. | Vitest fake timers don't exercise real tab throttling. |
| L8 | **Song change via Player unmount/remount (or song-switcher UI):** New song ▶ clicks work as expected; OLD song UI no longer updates. **Critical D1 validation** — before fix old listeners were wiped on stop. | Real React effect ordering + singleton transport persistence test. |

---

## 6. M3 (Recorded-Waveform Playback Test) Readiness Decision

### Decision: **READY — Subject to 2 stipulations S1 + S2**

### 3 M3 prerequisites chartered by Sprint 2.1 spec → ALL 3 validated:
| Prerequisite | Validation evidence | Status |
|---|---|---|
| Timing baseline stability (FR-1/FR-2) | TR-3a exact timestamp buckets at non-zero T0=10 all match `T0 + N*60/bpm ±1 ms` | ✅ Proven |
| Operation correctness for seek/tempo/stop event cancellation (FR-5/FR-6) | TR-3c+4b gap-clean, TR-4a ≤1 boundary glitch, TR-4c every gain silenced individually | ✅ Proven |
| Subscriber persistence across Player song changes (FR-8/FR-9/FR-10) | TR-2b no drain, TR-5a strictmode ok, TR-5b song-change ok | ✅ Proven |

### Stipulation S1 (must do before M3 feature merge):
Perform checklist L1–L8 on real Chrome/macOS using the existing Player UI build (Section 5). Record pass/fail per item. L2/L4/L5/L8 are BLOCKING if they fail (D2 D3 D1 real-world validation).

### Stipulation S2 (design contract for M3 implementors):
The `timeProvider` coordinate change defines one canonical formula for ALL scheduled audio (clicks + M3 recorded waveforms). M3 MUST reuse this exact formula and NOT introduce its own offset:
> `native_audio_ctx_schedule_time_for_waveform = transport.audioStartedAtCtxTime + waveform_musical_start_seconds`

When writing M3's deterministic regression test: reuse the injected fake AudioContext + `advanceByTicks` pattern from [Sprint2_1_Regression.test.ts](file:///Users/mac/Documents/ai-duet/packages/audio-core/__tests__/Sprint2_1_Regression.test.ts) and assert buffer `start(when)` against that formula with `CALC_TOLERANCE_MS=0.001` (again, calculation-tolerance label). No additional coordinate wrapping is permitted; the click-track and recorded-waveform timelines are now already unified by the D2 fix.

### Evidence of no regressions:
- typecheck EXIT=0, test EXIT=0 (67/67 substantive), build EXIT=0 (vite production bundle).
- ClickTrackTransport existing 11 tests → 0 regressions.
- BeatBarScheduler existing 15 tests → 0 regressions.
- AudioClock existing 20 tests → 0 regressions.

Public API of `ITransport`, `useTransport`, `Player.tsx` UI, and React lifecycle cleanup signatures: byte-for-byte unchanged. Scheduler tuning constants (lookAhead 100 ms, commit 20 ms, tick 25 ms): unchanged.

### Bottom line:
With S1 executed and S2 enforced in M3 PR review, **M3 recorded-waveform work can begin same-day**.
