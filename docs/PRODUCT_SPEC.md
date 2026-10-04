# AI Duet Product Specification (V1)
## Product Vision
Consumer browser karaoke / AI duet app. Modern music-streaming UI. A human sings alternating phrases with an AI singing partner over one properly licensed / public-domain song. Headphones required. V1 = one song, authored lyrics + melody, stable tempo clock, alternating human/AI phrases.
## Target Users
Casual singers, karaoke hobbyists, music-streaming users, bedroom producers demoing ideas.
## User Stories (3+)
- As a casual singer, I open the home page, browse featured songs with artwork, pick one, and start a duet within 2 taps.
- As a learner, I want the app to show clearly whether I or the AI sings the next line so I never miss an entrance.
- As a performer, I want a familiar music-player UI (play/pause, skip phrase, volume, progress bar) — not a DAW — so I feel at home.
## V1 Song Model
One song. Authored lyrics + melody. Known phrase boundaries (human / AI turns pre-authored). Tempo, time signature, backing track fixed.
## Phrase Alternation Contract
Each phrase is labelled HUMAN or AI at score-authoring time. At runtime: turn pill shows "You sing next" / "AI sings next". Turn is determined by score + current position; Performance Engine owns adjustments (M4).
## Headphones Requirement (V1)
Headphones are MANDATORY. Rationale: prevents mic feedback of backing/AI voice and simplifies live analysis. Bluetooth is warned against due to drift/delay (see AUDIO_ARCHITECTURE).
## UI / UX Principles (Consumer App, Not DAW)
- Clean home with search, song artwork tiles, lists.
- Simple song select + duet-mode choices.
- Music-player live-duet layout: lyrics line, playback controls, small turn indicator.
- Mobile-responsive, ≥44px touch targets.
- EXPLICITLY EXCLUDED UI: persistent waveforms, studio mixing panels, multi-track timelines, dense technical dashboards, fader banks, routing matrices, audio-engineering knobs.
## Out of Scope (V1)
Free improvisation, automatic song recognition, multi-user network duet, speaker mode / no-headphones, arbitrary songs, database accounts, social features.
## Content Rights
V1 song must be public-domain or have written license; must be documented before asset commit.
