# 10-SECOND CHALLENGE

A fast arcade/party game: **every round is a different mini-game, and you have exactly 10 seconds.**
Tap, type, stack, sort, dodge, remember, bounce an egg, feed a monster — then immediately face something
completely different.

Built with **TypeScript + HTML5 Canvas + Web Audio** (no game engine, no asset files — all graphics are
drawn and all sound is synthesized), bundled with **Vite**, tested with **Vitest**. Runs in any modern
browser on desktop, tablet and mobile.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173 (debug menu enabled)
npm test           # 358 automated tests
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
```

The production build in `dist/` is a static site — upload it to any static host (GitHub Pages, Netlify,
itch.io, S3…). It uses relative paths so it also works from a sub-folder.

Add `?debug=1` to the URL of any build to enable the developer menu (toggle with <kbd>`</kbd> or the 🛠 button).

## How to play

| Input        | What it does |
|--------------|--------------|
| Mouse / touch | Tap, click and drag in every mini-game |
| Keyboard     | Arrows/WASD move · Space/Enter = action/click · 1–9 pick answers · letters type · Esc/P pause |
| Gamepad      | Stick/D-pad move · A = action/click · B = secondary/back · Start = pause · menus navigable |

Pointer-based games also work on keyboard and gamepad through a **virtual cursor**: arrows/stick move it
and Space/A clicks.

### Modes

- **Quick Play** — 10 random challenges with a difficulty ramp (and optional adaptive difficulty).
- **Endless** — keep going until you fail 3 challenges.
- **Daily Challenge** — the same seeded 10 challenges for everyone on the same date (`seed = YYYYMMDD`).
- **Duel** — 2 players, hot-seat; both play the identical challenge each round.
- **Party** — 2–4 players, hot-seat.

### Mini-games (17)

| Category | Mini-games |
|----------|------------|
| Reflex   | Tap the Target · Don't Tap Red · Lightning Tap |
| Accuracy | Bullseye |
| Memory   | Remember the Order · What's Missing? |
| Speed    | Type This · Button Mash 🔒 |
| Timing   | Stop the Meter · Stack Perfectly 🔒 |
| Movement | Collect Everything · Dodge 🔒 |
| Drag & drop | Sort It |
| Logic    | Odd One Out · Biggest Number 🔒 |
| Chaos    | Save the Egg · Feed the Monster 🔒 |

🔒 = unlocked through play (runs completed, best score, or a trophy). The Daily Challenge always uses all of them.

## Documentation

- [Architecture & systems](docs/ARCHITECTURE.md) — state machine, game loop, scoring, saving, achievements, localization, design decisions.
- [Adding a mini-game](docs/ADDING_A_MINIGAME.md) — step-by-step with a complete example.
- [Testing & performance report](docs/TESTING_REPORT.md) — what is tested, bugs found and fixed, known limitations.

## Project layout

```
src/
  core/          GameState (FSM), Timer + Scheduler, Loop, InputManager, EventBus, Random, Pool, Logger
  gameplay/      MiniGame interface + MiniGameBase, Registry, Selector, RunManager (modes),
                 Scoring, Difficulty, Modifiers (special rounds), ChoiceButtons, minigames/*
  render/        Renderer (camera, letterboxing), Effects (pooled particles/text), Draw helpers, Theme
  audio/         AudioManager (synth SFX, buses, voice cap), MusicManager (step sequencer)
  progression/   SaveData (versioned schema + migration), SaveManager, Settings, Achievements, Unlocks, Progression
  services/      LeaderboardService (+ local impl & validation), AnalyticsService (no-op / debug)
  i18n/          t() lookup with fallback + English strings
  ui/            Screens (menu, modes, settings, stats, trophies), HUD, intro/results/handoff/pause, final results
  debug/         Developer menu
  Game.ts        GameManager: owns every state transition
tests/           Vitest suites (core, gameplay, progression, every mini-game, perfect-play bots)
```
