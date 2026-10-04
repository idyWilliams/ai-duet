# AI Duet Roadmap
## M0 — Architecture, Documentation, Repository Scaffold + Consumer UI Shell (THIS PHASE) ✅ planning, implementing
- Select package manager + monorepo tool; write docs; scaffold 4 packages; define TS interfaces; write M1 (audio clock + scheduler + tests); ship consumer React UI shell (home/song/player 3 pages, stub transport, responsive, no DAW).
## M1 — Audio Clock + Deterministic Beat/Bar Scheduler (code part of this implementation)
- Concrete AudioClock, BeatBarScheduler classes with pure math; deterministic Vitest tests; no AudioWorklet yet. ✅ implementing
## M2 — Backing-Track Lane + Click Track + Latency Calibration Harness
Deliverables: IBackingTrackLane implementation load/start/stop; click track generator on a mixer sub-lane; IMixer + per-lane volume with ramps; latency calibration UI flow (plays loopback tone, records mic, measures offset) + documentation of procedure; headphone detection hint UI; BT warning banner copy.
## M3 — Score Follower for One Authored Score
Deliverables: Implement IScoreFollower for the pre-selected single V1 song; offline alignment vs known lyrics/melody; emits SongPositionReport (seconds/section/phrase/Confidence). Benchmark accuracy on recorded test vocal takes.
## M4 — Performance Engine (Look-ahead, Commit Horizon, Cancellation, Fallbacks)
Deliverables: Concrete IPerformanceEngine.tick(); tentative→committed lifecycle; plan cancellation semantics; fallback selection when confidence low or render late; deterministic unit tests for plan lifecycles.
## M5 — Singing Engine Integration + Cached Fallback Library
Deliverables: Real (non-stub) ISingingEngine.render() backend; N=20 render benchmark per-bar (see ARCHITECTURE); pass/fail enforcement; RenderedVocal caching per phrase; graceful fallback when render does not meet threshold.
## M6 — End-to-End V1 Demo with One Cleared Song
Deliverables: Connect React UI to real ITransport → AudioClock → BeatBarScheduler → BackingTrack → ScoreFollower → PerformanceEngine → SingingEngine → Mixer; human mic input capture turn-based; one cleared public-domain/licensed song committed with LICENSE-THIRD-PARTY.md; headphone check UI flow; explicit BT warning banner; mobile polish.
## M7+ Future Work
- Free improvisation mode
- Automatic song recognition
- Multi-user network duet (WebRTC)
- Bluetooth drift compensator via live cross-correlation
- Song library expansion, accounts, history
- Tablet layout polish
