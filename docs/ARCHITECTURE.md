# Architecture

10-SECOND CHALLENGE is a single-page web game written in TypeScript. It has no engine dependency:
rendering is Canvas 2D, UI is plain DOM, audio is Web Audio. Every gameplay rule lives in plain
TypeScript classes that run headless, which is why mini-games, scoring and progression are fully
unit-tested without a browser.

```
             ┌──────────────── Game (GameManager) ────────────────┐
  Input ───▶ │ StateMachine · Scheduler · ChallengeTimer · Run     │ ───▶ UI screens (DOM)
 (mouse,     │      │                │                │            │ ───▶ Renderer (canvas, camera, FX)
  touch,     │      ▼                ▼                ▼            │ ───▶ Audio / Music
  keys,      │  MiniGame (active)  Progression     EventBus ──────┼───▶ Analytics (optional)
  gamepad)   └─────────────────────────────────────────────────────┘
```

## Layers

| Layer | Files | Responsibility |
|-------|-------|----------------|
| Core | `core/GameState.ts`, `Timer.ts`, `Loop.ts`, `InputManager.ts`, `EventBus.ts`, `Random.ts`, `Pool.ts` | Engine-like services with no game rules |
| Gameplay | `gameplay/*` | Mini-game framework, selection, runs/modes, scoring, difficulty, special rounds |
| Render | `render/*` | World→screen transform, camera, pooled particles/floating text, drawing helpers, themes |
| Audio | `audio/*` | Synthesized SFX on mixer buses; procedural music with intensity |
| Progression | `progression/*` | Versioned save, settings, stats, achievements, unlocks, titles |
| Services | `services/*` | Leaderboard and analytics **interfaces** with local / no-op implementations |
| UI | `ui/*` | DOM screens; they call `UIActions` and never mutate game state directly |

## Game states

`core/GameState.ts` defines the states and **every legal edge**. Anything else is rejected, so
contradictory situations (results firing twice, input after time-up, starting a challenge before the
previous one is cleaned up) cannot happen.

```
BOOT → MAIN_MENU ⇄ MODE_SELECT / SETTINGS / STATS / ACHIEVEMENTS
MAIN_MENU/MODE_SELECT/RUN_RESULTS → (PLAYER_HANDOFF) → CHALLENGE_INTRO → COUNTDOWN → CHALLENGE_ACTIVE
CHALLENGE_ACTIVE → CHALLENGE_RESULTS → ROUND_TRANSITION → CHALLENGE_INTRO | PLAYER_HANDOFF | RUN_RESULTS
PAUSED ← any in-run state; resume returns *only* to the interrupted state (or quit to MAIN_MENU)
```

**Every transition has one owner: `Game.ts`.** UI and input only request actions (`advance()`,
`pause()`, `startMode()`…), and `Game` validates them against the current state.

### Timing and transitions

- The frame loop (`core/Loop.ts`) passes real delta time, clamped to 0.1 s so that a tab switch can't
  produce huge jumps. The game also auto-pauses when the tab is hidden.
- `ChallengeTimer` counts down with delta time, never goes negative, and fires `onExpire` **exactly once**.
  Display rounds *up* to the tenth, so "0.0" only appears when time really is up.
- All flow delays (intro, countdown steps, results hold) use a **game-time `Scheduler`**, not
  `setTimeout`. Pausing stops the scheduler, so pending transitions pause too.
  `scheduleInState()` also drops a callback if the state changed before it fired.
- Flow timings live in `TIMINGS` in `Game.ts`: intro ≈ 1.15 s, then 3-2-1 at 0.42 s steps, GO, and a
  1.9 s results card. The results card ignores "continue" input for 0.6 s, so frantic tapping can't
  skip it by accident.

## Mini-game framework

- `MiniGameDefinition` (data): id, name/instruction/description keys, category, time limit (capped at 10),
  selection weight, score multiplier, unlock requirement, supported special-round modifiers, input
  capabilities, icon, and a `create()` factory.
- `MiniGame` (behaviour): `initialize → prepare → start → update/handleInput → complete → calculateScore → cleanup`.
- `MiniGameBase` enforces that lifecycle. It ignores input unless active, makes `complete()` and
  `cleanup()` idempotent, scales gameplay time by the SPEED modifier, and caches the final score.
- `MiniGameContext` is all a mini-game can touch: a seeded RNG, difficulty, world size, input snapshot,
  `fx` (particles / floating text / shake / flash / sfx), camera, palette, timer queries and `t()`.
  Because of this, mini-games never reference the DOM, audio or renderer directly, and tests can run
  them headless.
- `MiniGameRegistry` validates definitions (unique id, positive weight, time cap).
  `MiniGameSelector` picks the next game.
- If a mini-game throws during init, its id is quarantined and a replacement is chosen. If it throws
  during update, the challenge ends with what was scored. If scoring throws, it scores 0. None of these
  crash the run.

### World coordinates

Mini-games work in **world units**. In landscape the shorter side is 1000 units and the width grows with
the aspect ratio. In portrait the world is 800 units wide, which makes targets and text bigger on phones.
`Renderer` fits and letterboxes the world, and `toWorld()` converts pointer positions. Aspect ratio is
clamped (0.5–2.1), so ultrawide and very tall screens letterbox rather than distort.

## Input

`InputManager` turns devices into abstract `InputAction`s: `pointerDown/Move/Up`, `primary`,
`secondary`, `direction`, `text`, `choice`. It also keeps an `InputSnapshot` with the move vector and
pointer that games can poll. Each definition declares its `inputs`, and the input layer adapts:

- games with `pointer` but no `move` get a **virtual cursor** (arrows/stick move it, Space/A clicks);
- `primary` games receive Space/Enter/A directly;
- `text` games receive letters (WASD is not hijacked for movement);
- `choice` games receive the number keys 1–9;
- the REVERSE CONTROLS special round mirrors horizontal input (movement games only).

Gameplay input is routed **only** while the state is `CHALLENGE_ACTIVE` and the challenge hasn't
ended. Outside gameplay, taps/Space/Enter/A act as "advance", and the gamepad D-pad moves focus
between menu buttons.

## Selection, difficulty and special rounds

- **Selection** (`MiniGameSelector`): weighted random choice that excludes the last ~5 games and the
  last 2 categories. If the pool is too small, the constraints relax step by step, so selection never fails.
- **Difficulty** (`EASY/NORMAL/HARD/EXTREME`): each mini-game maps the level onto *mechanics* via
  `tune(d, [easy, normal, hard, extreme])`. Examples: moving and fake targets, decoy signals, a visible
  item used as a decoy, closer numbers, extra bins, wind, a second egg, deflating balloons, eased needles.
  Runs ramp from easy to extreme. Endless steps up every 5 rounds.
- **Adaptive difficulty** (Quick Play, optional in Settings): after a window of 3 results, it shifts the
  difficulty by at most ±1 step. It never changes scores.
- **Special rounds** (`Modifiers.ts`): DOUBLE SCORE, PERFECT BONUS, REVERSE CONTROLS, TINY TARGETS,
  SPEED ROUND, CHAOS ROUND. About 15% chance, never in the first 2 rounds, never twice in a row, and only
  modifiers the chosen game supports.
- **Daily**: the run RNG is seeded with `YYYYMMDD` and the pool is sorted by id. Every player gets the
  same games, difficulties, modifiers and per-challenge seeds.

## Scoring

Every mini-game reports `completion` (how much of the objective was done) and `accuracy` (how cleanly it
was done), each between 0 and 1. `buildScore()` combines them:

```
performance = completion × (w + (1 − w) × accuracy)       w = completionWeight (default 0.7)
score       = round(performance × 100)  (100 only when performance is truly perfect)
```

Accuracy only scales work actually done, so idling scores 0. Perfect play is needed for 100, and every
mini-game shares the same 0–100 scale. Two automated suites enforce this balance:

- a **perfect-play bot** for every game must reach 100 within 10 seconds;
- an **idle player** must score below 30 (FAIL) in every game.

| Score | Rating |
|-------|--------|
| 0–29 | FAIL |
| 30–49 | OK |
| 50–69 | GOOD |
| 70–89 | GREAT |
| 90–99 | AMAZING |
| 100 | PERFECT |

**Combo:** GOOD or better adds 1, PERFECT adds 2, OK holds, and FAIL breaks it.
**Points** for a round:

```
points = (score × combo multiplier + perfect bonus) × modifier multiplier × definition scoreMultiplier
```

The combo multiplier is capped at x5 and only applies to GOOD or better. The perfect bonus is 50, or
150 in a PERFECT BONUS round. The final screen shows total points, the normalized sum (for example
`847 / 1000`), best combo, perfects, challenges played and challenges cleared. The run rank (SLEEPY …
10-SECOND LEGEND) comes from the average normalized score.

## Saving

`progression/SaveData.ts` defines a **versioned schema** (currently v2) holding best scores (overall and
per mode), best combo, stats, per-game bests and plays, unlocked games and themes, titles, achievements,
settings, the daily record and history, local leaderboards and the player name.

- `SaveManager.load()` never throws. Missing data starts fresh. Corrupt JSON is backed up to
  `ten-second-challenge.save.corrupt`, the game starts fresh, and the player sees a toast.
- `sanitizeSave()` validates **each field** (types, ranges, array contents) and keeps whatever is still valid.
- `migrate()` runs one step per version. To change the format, bump `SAVE_VERSION` and add
  `MIGRATIONS[oldVersion]`.
- Storage is an interface (`StorageAdapter`): `localStorage` in browsers, memory in tests and in
  private mode.

## Achievements, unlocks, titles

- `ACHIEVEMENTS` in `progression/Achievements.ts` is a data list of `{ id, icon, nameKey, descKey, check(ctx) }`.
  `check` receives the save, all game definitions, and either the latest round outcome or the run
  summary. **To add one, append an entry and add its two strings to `i18n/en.ts`.** The evaluator
  never re-awards an achievement, and a throwing check can't break the others.
- Unlocks for mini-games and themes use `UnlockRequirement`: `none | runs | bestScore | achievement`.
  The rules are applied after every run by `UnlockManager.refresh()`. Nothing is purchasable.
- Titles are the run ranks a player has earned. The best one is shown on the main menu.

## Localization

All user-facing text goes through `t(key, params)` (`i18n/i18n.ts`). Lookup tries the active locale,
then English, then returns the key itself; missing keys are logged once. **To add a language:** create
`i18n/<lang>.ts` with any subset of keys, then call `registerLocale('<lang>', dict)` and `setLocale()`
(the `language` setting already exists). A test scans the source and fails if any referenced key is
missing from `en.ts`.

## Audio

`AudioManager` owns one `AudioContext`, which is unlocked on the first user gesture, plus master, SFX and
music gain buses wired to the volume and toggle settings. Every sound is a small synthesized recipe, so
there are no assets to load or lose. It caps concurrent voices (24) and throttles repeats of the same sound.
`MusicManager` is a lookahead step sequencer with kick, hats, snare, bass and lead. It has a calm menu mood
and a gameplay mood whose tempo and density rise during the last 3 seconds.

## Rendering & effects

`Renderer` draws the background grid, then the mini-game in world space through the camera (zoom, pan,
shake), then pooled particles, confetti and floating text, then a screen flash. The camera is reset after
every challenge. Reduced shake disables shake; reduced effects cuts particle counts to 25%, disables
flashes and stops CSS animations. Device pixel ratio is capped at 2 for performance.

## Services (online-ready)

- `LeaderboardService` (`submit`, `top`) has a local implementation stored in the save.
  `validateSubmission()` rejects impossible values (negative scores, score sums above `rounds × 100`,
  points above the per-round maximum). An online implementation must repeat these checks server-side.
- `AnalyticsService` (`track`) is a no-op in production and keeps an in-memory log in debug. It is fed only
  through `Game.events` (`EventBus`), so the game never depends on it.

## Debug tools

`?debug=1`, or any dev build, mounts the debug menu. It can skip or restart a challenge, force a specific
mini-game, set the difficulty, add score, unlock everything, reset the save, show FPS/state/timer overlays
and dump analytics. In debug builds, `window.game` exposes the `Game` instance for console poking and
browser automation.

## Design decisions

- **Web + TypeScript, no engine.** This runs everywhere (desktop, mobile, tablet) with one codebase,
  starts in under a second, and keeps every rule unit-testable.
- **Procedural art and audio.** There are no missing-asset failure modes, the bundle is tiny
  (~50 KB gzipped JS), and themes are instant.
- **One persistent canvas plus DOM overlays.** There are no scene loads between challenges. Mini-games
  are lightweight objects created per challenge and fully cleaned up afterwards.
- **Colour is never the only signal.** Good and bad items also differ by shape and symbol (✓ circle vs ✕
  spiky star, hatched target zones). Odd One Out uses shape, direction or size, never hue. There is a
  colour-blind palette (blue/orange) and a high-contrast theme.
- **Hot-seat multiplayer.** Duel and Party give every player the identical seeded challenge, so the
  comparison is fair without networking.
