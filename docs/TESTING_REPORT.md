# Testing & performance report

## Automated tests: `npm test` (Vitest, 358 tests, about 1.5 s)

| Suite | What it covers |
|-------|----------------|
| `tests/core.test.ts` (27) | **State machine**: legal and illegal transitions, no duplicate transitions, results can't start twice, pause only resumes to the interrupted state, no dead-end states. **Timer**: starts at 10.0, counts with delta time, can't go negative, expires exactly once, no drift over 600 frames, pause/resume, rejects NaN/negative dt, display of the last tenths. **Scheduler**, **Random** (determinism, ranges, weights, daily seed), **Pool**, **EventBus** (no duplicate listeners; a throwing handler is isolated) |
| `tests/gameplay.test.ts` (32) | **Scoring**: normalization, rating bands, minimum/maximum/perfect, idling scores 0, clamping garbage input, combo rules, points, ranks. **Difficulty**: ramp, adaptive ±1 cap. **Registry**: validation, 10 s cap. **Selector**: no consecutive repeats, no back-to-back categories over 300 picks, full coverage, tiny pools, determinism. **Modifiers**: placement rules. **Runs**: Quick = 10 rounds, Endless lives and safety cap, Daily identical across pool orders, Duel/Party turn order and ties, debug overrides |
| `tests/minigames.test.ts` (221) | For **every mini-game** at **every difficulty**: valid definition and localized strings, completes within 10 s with no input, survives random-input fuzzing (with modifiers), ignores input after completion, works on a portrait world, deterministic per seed, idempotent `complete()`/`cleanup()` |
| `tests/perfect.test.ts` (52) | A **perfect-play bot for every mini-game** reaches 100 on EASY and NORMAL within 10 s, and an **idle player** scores FAIL in every game. These two checks keep the 0–100 scale balanced across games |
| `tests/progression.test.ts` (26) | **Save**: defaults, round-trip, corrupt JSON (with backup), non-object JSON, field-by-field sanitizing, **v1 → v2 migration**, storage that throws, reset keeps settings. **Progression**: stats, bests, achievements (no re-award, a throwing check is isolated), memory streak, run records, titles, unlocks, daily history. **Leaderboard**: validation of impossible scores, sorting. **i18n**: interpolation, fallback, and a source scan that fails on any missing key |

`npm run typecheck` runs strict TypeScript over the source and the tests. CI (`.github/workflows/ci.yml`)
runs typecheck, tests and build on every push and pull request.

## Browser testing (headless Chromium via Playwright)

These scripted sessions ran against the production build:

- **Desktop 1280×800 and phone 390×844 (touch):** boot → menu → Quick Play → intro → countdown →
  random taps → results → full 10-round run → final results. **No console errors or warnings.**
- **Pause:** Esc during a challenge freezes the timer (8.6 s before and after a 1.5 s pause) and blurs
  the play field. Resume continues from the same time.
- **Keyboard:** completed Type This by typing. Used the virtual cursor (arrows + Space) on Tap the Target.
- **Menus:** Settings, Stats and Trophies open and close. Quit to menu from pause works.
- **Duel:** 5 rounds × 2 players = 10 hand-offs, then a winner/tie screen.
- **Endless:** a run ends after 3 failed challenges with a GAME OVER summary.
- **Stress:** 300 rapid clicks plus Enter presses during a run. No errors, no stuck or duplicated states.
- Screenshots of every mini-game were reviewed on both viewports.

## Bugs found and fixed during development

1. **Scoring:** a player who did nothing but never mis-tapped scored 30 (OK) because accuracy was added on
   its own. Fixed with `performance = completion × (w + (1−w) × accuracy)`. An idle-player test now guards it.
2. **Save the Egg** could be "won" by idling on EASY (the egg bounced straight up forever). The egg now
   gets a random sideways drift.
3. **HUD** showed the *next* round number while the results card was up. Added `Run.displayRound`.
4. **Remember the Order:** the "WATCH!" banner overlapped the answer pads. Moved it into the display panel.
5. **Phones:** the round label collided with the timer, and mini-games rendered small. Added a narrow HUD
   layout, and the portrait world is now 800 units wide (targets and text ≈25% larger).
6. **REVERSE CONTROLS** on pointer games would have registered clicks away from where the player clicked.
   It is now limited to movement games, where it is a fair twist.
7. **Stack Perfectly:** blocks spawned off-screen, so the goal was unreachable for strong players. Blocks
   now spawn near the tower.
8. **Lightning Tap:** three attempts could overrun 10 s on HARD. Waits shortened.
9. **Sort It** mutated game state inside `render()`. Moved to `update()`.
10. **Music** allocated a new noise buffer for every hi-hat hit. Now cached.
11. **Debug "Force mini-game"** used from the menu applied to round 2, not round 1.

## Performance

Measured in headless Chromium on the production build over 120 challenges (12 full runs with constant clicking):

- **Frame rate:** median 60 FPS, minimum sample 55 FPS during confetti and particle bursts.
- **Memory:** JS heap 1.9 MB at the menu, then 2.97 MB → 3.02 MB → 3.15 MB after 40/80/120 challenges.
  It plateaus; the small growth is bounded buffers (log history ≤200, analytics ≤100, leaderboards ≤10
  per board). **No leaks:** the event listener count stays constant, and mini-game objects are released
  and their pools emptied after every challenge.
- **Particles:** pooled, capped at 400 (peak observed 160). Floating text is pooled and capped at 12.
- **Loading:** about 0.9 s from navigation to an interactive menu, including the web font. The JS bundle
  is 162 KB (50 KB gzipped) and CSS is 18 KB. There are no image or audio assets. Challenges never load
  anything: the next mini-game is a plain object built in under a millisecond during the intro.
- **Per-frame work:** the HUD only touches the DOM when a displayed value changes. The canvas DPR is capped
  at 2. Audio voices are capped at 24, with throttling for repeated sounds.

## Known limitations

- **Gamepad** support follows the standard mapping but has not been tested on physical hardware.
- **Audio** runs without errors in automated tests, but the mix hasn't been tuned by ear on real devices.
- **Online services** are interface-only. Leaderboards are local; global and friends boards need a
  backend implementing `LeaderboardService`, with server-side validation.
- **Multiplayer** is hot-seat only (one device, taking turns). There is no networked play.
- **Localization:** only English ships; the architecture and fallback are in place.
- **Emoji** (icons, What's Missing, Feed the Monster) look different on each platform's emoji font.
- The **Daily Challenge** rolls over at local midnight, so players in different time zones switch days at
  different moments. A server-provided date would fix this.
- Fonts come from Google Fonts. Offline, the game falls back to the system UI font.
