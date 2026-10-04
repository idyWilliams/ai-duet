# AI Duet Audio Architecture
## Non-Negotiable Rule
**AudioContext.currentTime is the single authoritative timeline.** All musical scheduling uses SecondsTime values derived from it. Never use Date.now or performance.now for scheduling math. They MAY appear ONLY in ProbeReading.wallClockReceivedAt / latency-measurement fields.
## Thread Boundary
- Main thread: Clock math, Score Follower algo (non-realtime parts), Performance Engine, React UI, plan generation, buffer pre-render orchestration.
- Audio thread (AudioWorklet processor): Sample-accurate lane playback of already-committed buffers, per-sample mixing. MUST NOT: perform fetch/XHR, run neural inference, do heavy math. It only schedules/plays what was posted to it.
- Communication: typed MessagePort messages. PostMessage is the only bridge. Messages posted with a ScheduledAt SecondsTime; Worklet honors that.
## Clock Model
- SecondsTime = AudioContext.currentTime (branded).
- BeatTime = accumulated beats from start (piecewise linear over tempo segments; tempo changes apply at a specified SecondsTime with no retro-active change to already-emitted committed events).
- BarTime = floor((cumulative-beats) / beatsPerBar) with time-signature changes effective at specified SecondsTime.
- Time signature: (beatsPerBar, beatUnit) tuple; beatUnit=4 means quarter-note beat.
- IClock supports setTempo(effectiveAt, bpm) and setTimeSignature(effectiveAt, ...).
## Beat / Bar Scheduler
- Main-thread tick (25ms default) scans the window [now, now + lookAhead).
- Events ≤ (now + commitHorizon) are marked committed, passed to Worklet (or in M1, to listeners) with committed flag true. Emitted once only.
- Events in (now + commitHorizon, now + lookAhead] are tentative; listeners get them but may be cancelled.
- cancelFuture(force=false): removes tentative only. force=true attempts committed but returns Result.err for any that cannot be undone.
## Audio Lanes (Mixer Model)
- backing (immutable, loaded once, scheduled start).
- human (live mic input is monitored on headphones ONLY — not looped back to output to avoid feedback in headphone mode).
- ai (RenderedVocal buffers scheduled at precise SecondsTime).
- All summed by IMixer with per-lane volume ramps.
## Latency Calibration (M2 deliverable; procedure here)
1. User plugs in wired headphones + mic. App plays a short loopback click via output at known scheduled SecondsTime, records mic input, measures cross-correlation peak offset → output+input roundtrip latency stored.
2. All scheduled mic-analyzer timestamps are compensated forward by this measured latency so ScoreFollower sees the "correct" timeline relative to backing.
## Bluetooth Limitations
- BT speakers/headphones buffer ~40–150ms; no AudioContext.sync timestamping → drift relative to AudioContext.currentTime.
- **V1 EXPLICITLY REQUIRES WIRED HEADPHONES.** BT option is hidden by default and, if enabled by a future advanced toggle, shows a bright warning banner about lag and turn-indicator inaccuracy.
- Future compensation: live cross-correlate mic signal with known backing to estimate instantaneous drift + apply to clock observer.
## Headphones Rationale
Without headphones, mic input hears backing+AI playback and corrupts ScoreFollower (it cannot tell human voice from playback). Feedback also occurs. HENCE: mandatory.
## M1 Specifics
- No AudioWorklet yet. BeatBarScheduler works main-thread only with deterministic time provider injection for tests.
- ITransport is interface + StubTransport returning NotImplemented. No audio plays in M1.
