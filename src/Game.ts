import { AudioManager, type SoundName } from './audio/AudioManager';
import { MusicManager } from './audio/MusicManager';
import { EventBus } from './core/EventBus';
import { GameState, StateMachine, type StateChange } from './core/GameState';
import { InputManager } from './core/InputManager';
import { createLogger } from './core/Logger';
import { Loop } from './core/Loop';
import { Random, dateKey } from './core/Random';
import { ChallengeTimer, Scheduler } from './core/Timer';
import type { Difficulty } from './gameplay/Difficulty';
import type { EffectsApi, MiniGame, MiniGameContext, MiniGameDefinition } from './gameplay/MiniGame';
import { MiniGameRegistry } from './gameplay/MiniGameRegistry';
import { ALL_MINIGAMES } from './gameplay/minigames';
import { MODIFIERS } from './gameplay/Modifiers';
import { MODES, Run, type ChallengeSpec, type ModeId, type RoundOutcome, type RunSummary } from './gameplay/RunManager';
import { sanitizeScore } from './gameplay/Scoring';
import { setLocale, t } from './i18n/i18n';
import type { AchievementDef } from './progression/Achievements';
import { Progression, type RunProgress } from './progression/Progression';
import { SaveManager, createBrowserStorage } from './progression/SaveManager';
import { sanitizeSettings, type Settings } from './progression/Settings';
import { Renderer } from './render/Renderer';
import { applyColorBlind, getTheme, type Palette } from './render/Theme';
import { ring } from './render/Draw';
import { DebugAnalytics, NoopAnalytics, type AnalyticsService } from './services/Analytics';
import { LocalLeaderboardService, submissionFromRun, type LeaderboardService } from './services/Leaderboard';
import { AchievementsScreen } from './ui/AchievementsScreen';
import { HandoffOverlay, IntroOverlay, PauseOverlay, ResultsOverlay } from './ui/ChallengeUI';
import { el } from './ui/dom';
import { FinalResults } from './ui/FinalResults';
import { HUD } from './ui/HUD';
import { MainMenu, TITLE_ORDER } from './ui/MainMenu';
import { ModeSelect } from './ui/ModeSelect';
import type { Screen } from './ui/Screen';
import { SettingsScreen } from './ui/SettingsScreen';
import { StatsScreen } from './ui/StatsScreen';
import { Toasts } from './ui/Toasts';
import type { MenuScreenId, UIActions, UIData } from './ui/types';

const log = createLogger('Game');

/** Flow timings (seconds). Kept short: minimal downtime is a core design rule. */
export const TIMINGS = {
  intro: 1.15,
  countStep: 0.42,
  goHold: 0.45,
  results: 1.9,
  resultsExtended: 2.6,
  /** Results ignore "continue" input this long, so frantic tapping can't skip them by accident. */
  resultsMinShow: 0.6,
  introMinShow: 0.25,
};

/** Game-wide events. Optional systems (analytics, future online services) subscribe here. */
export interface GameEvents {
  stateChanged: StateChange;
  challengeStarted: ChallengeSpec;
  challengeEnded: { spec: ChallengeSpec; outcome: RoundOutcome };
  runCompleted: { summary: RunSummary; progress: RunProgress | null };
  achievementUnlocked: AchievementDef;
}

interface ActiveChallenge {
  spec: ChallengeSpec;
  def: MiniGameDefinition;
  game: MiniGame;
  timer: ChallengeTimer;
  /** Guards against ending the same challenge twice. */
  ended: boolean;
}

export interface GameOptions {
  root: HTMLElement;
  stage: HTMLElement;
  canvas: HTMLCanvasElement;
  debug: boolean;
}

/**
 * GameManager: owns the state machine and every transition. Other systems
 * (UI, input, mini-games) request changes; only this class performs them.
 */
export class Game implements UIActions {
  readonly sm = new StateMachine();
  readonly events = new EventBus<GameEvents>();
  readonly registry = new MiniGameRegistry();
  readonly saves: SaveManager;
  readonly renderer: Renderer;
  readonly audio = new AudioManager();
  readonly music: MusicManager;
  readonly input: InputManager;
  readonly progression: Progression;
  readonly leaderboard: LeaderboardService;
  readonly analytics: AnalyticsService;
  readonly loop: Loop;
  private scheduler = new Scheduler();
  private run: Run | null = null;
  private lastRunConfig: { mode: ModeId; players: number } | null = null;
  private active: ActiveChallenge | null = null;
  private lastOutcome: RoundOutcome | null = null;
  private stateEnteredAt = 0;
  private clock = 0;
  private brokenGames = new Set<string>();
  private lastUrgentSecond = -1;
  private palette: Palette;
  private debugOverlay = { fps: false, state: false, timer: false };
  forcedDifficulty: Difficulty | null = null;
  /** Debug: game to force as the first challenge of the next run. */
  private pendingForce: MiniGameDefinition | null = null;

  // UI
  readonly hud: HUD;
  readonly toasts = new Toasts();
  private screens: Record<MenuScreenId, Screen>;
  private intro: IntroOverlay;
  private results: ResultsOverlay;
  private handoff: HandoffOverlay;
  private pauseOverlay: PauseOverlay;
  private finalResults: FinalResults;
  private modeSelect: ModeSelect;
  private debugReadout: HTMLElement;

  constructor(private readonly opts: GameOptions) {
    const prefersReducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.saves = new SaveManager(createBrowserStorage(), prefersReducedMotion);
    this.renderer = new Renderer(opts.canvas);
    this.music = new MusicManager(this.audio);
    this.progression = new Progression(ALL_MINIGAMES);
    this.leaderboard = new LocalLeaderboardService(() => this.saves.data, () => this.saves.save());
    this.analytics = opts.debug ? new DebugAnalytics() : new NoopAnalytics();
    this.palette = getTheme('neon').palette;
    this.loop = new Loop((dt) => this.tick(dt));
    this.input = new InputManager(opts.canvas, this.renderer, {
      onAction: (action) => {
        if (this.sm.is(GameState.CHALLENGE_ACTIVE) && this.active && !this.active.ended) this.active.game.handleInput(action);
      },
      onPause: () => this.handlePauseKey(),
      onDebugToggle: () => document.body.classList.toggle('debug-open', this.opts.debug && !document.body.classList.contains('debug-open')),
      onAdvance: () => this.advance(),
      onBack: () => this.back(),
      onGesture: () => this.audio.unlock(),
    });

    const data: UIData = {
      save: () => this.saves.data,
      games: () => this.registry.all(),
      progression: this.progression,
      leaderboard: this.leaderboard,
      dailyKey: () => dateKey(),
    };
    this.hud = new HUD(() => this.pause());
    this.modeSelect = new ModeSelect(this);
    this.screens = {
      MAIN_MENU: new MainMenu(this, data),
      MODE_SELECT: this.modeSelect,
      SETTINGS: new SettingsScreen(this, data),
      STATS: new StatsScreen(this, data),
      ACHIEVEMENTS: new AchievementsScreen(this, data),
    };
    this.intro = new IntroOverlay(this);
    this.results = new ResultsOverlay(this);
    this.handoff = new HandoffOverlay(this);
    this.pauseOverlay = new PauseOverlay(this);
    this.finalResults = new FinalResults(this, data);
    this.debugReadout = el('div', { class: 'debug-readout', 'aria-hidden': 'true' });
  }

  // ---------------------------------------------------------------- lifecycle

  boot(): void {
    this.registry.registerAll(ALL_MINIGAMES);
    const save = this.saves.load();
    this.progression.initialize(save);
    this.saves.save();
    setLocale(save.settings.language);

    const { root, stage } = this.opts;
    root.prepend(this.hud.root);
    root.append(
      ...Object.values(this.screens).map((s) => s.root),
      this.intro.root,
      this.results.root,
      this.handoff.root,
      this.pauseOverlay.root,
      this.finalResults.root,
      this.toasts.root,
      this.debugReadout,
    );
    this.applySettings(save.settings);

    const resize = () => this.renderer.resize(stage.clientWidth, stage.clientHeight);
    new ResizeObserver(resize).observe(stage);
    resize();
    this.input.attach();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pause();
        this.audio.suspend();
      } else {
        this.audio.resume();
      }
    });
    this.sm.onChange((change) => {
      this.stateEnteredAt = this.clock;
      document.body.dataset.state = change.to;
      log.debug(`${change.from} → ${change.to}`);
      this.events.emit('stateChanged', change);
    });
    this.connectAnalytics();
    this.loop.start();
    this.sm.transition(GameState.MAIN_MENU);
    this.showMenu('MAIN_MENU');
    if (this.saves.loadStatus === 'recovered') this.toasts.show('⚠️', t('toast.save_recovered'));
  }

  /** Analytics only listens to events; the game never depends on it. */
  private connectAnalytics(): void {
    const a = this.analytics;
    this.events.on('challengeStarted', (spec) => a.track({ name: 'ChallengeStarted', gameId: spec.def.id, difficulty: spec.difficulty, modifier: spec.modifier }));
    this.events.on('challengeEnded', ({ spec, outcome }) => {
      a.track(
        outcome.failed
          ? { name: 'ChallengeFailed', gameId: spec.def.id, score: outcome.score, reason: outcome.result.failReasonKey }
          : { name: 'ChallengeCompleted', gameId: spec.def.id, score: outcome.score },
      );
      if (outcome.perfect) a.track({ name: 'PerfectScore', gameId: spec.def.id });
    });
    this.events.on('runCompleted', ({ summary }) => a.track({ name: 'RunCompleted', mode: summary.mode, points: summary.players[0].points, rounds: summary.players[0].rounds }));
    this.events.on('achievementUnlocked', (def) => a.track({ name: 'AchievementUnlocked', id: def.id }));
  }

  private tick(dt: number): void {
    this.clock += dt;
    this.input.update(dt);
    const paused = this.sm.is(GameState.PAUSED);
    if (!paused) {
      this.scheduler.update(dt);
      this.updateChallenge(dt);
      this.renderer.update(dt);
    }
    this.render();
    this.updateHud();
    if (this.opts.debug) this.updateDebugReadout();
  }

  private updateChallenge(dt: number): void {
    const a = this.active;
    if (!a) return;
    if (this.sm.is(GameState.CHALLENGE_ACTIVE) && !a.ended) {
      try {
        a.game.update(dt);
      } catch (err) {
        log.error(`Mini-game ${a.def.id} crashed during update`, err);
        a.game.complete('aborted');
      }
      a.timer.update(dt);
      if (a.game.state === 'finished') this.endChallenge();
      // Final-seconds urgency.
      const sec = Math.ceil(a.timer.remaining);
      if (sec <= 3 && sec >= 1 && sec !== this.lastUrgentSecond && !a.ended) {
        this.lastUrgentSecond = sec;
        this.sfx('urgent');
        this.hud.pulseTimer();
      }
      this.music.setIntensity(a.timer.remaining <= 3 ? 1 - a.timer.remaining / 3 : 0);
    } else if (a.game.state === 'finished') {
      try {
        a.game.update(dt);
      } catch {
        /* finished-state animation is cosmetic */
      }
    }
  }

  private render(): void {
    const a = this.active;
    const showWorld = a && this.sm.is(GameState.CHALLENGE_INTRO, GameState.COUNTDOWN, GameState.CHALLENGE_ACTIVE, GameState.CHALLENGE_RESULTS);
    const dim = this.sm.is(GameState.CHALLENGE_INTRO, GameState.COUNTDOWN) ? 0.45 : this.sm.is(GameState.CHALLENGE_RESULTS) ? 0.35 : 0;
    const cursor = this.input.virtualCursor;
    this.renderer.render(
      showWorld && a
        ? (g) => {
            a.game.render(g);
            if (cursor) {
              ring(g, cursor.x, cursor.y, 26, '#fff', 6);
              ring(g, cursor.x, cursor.y, 6, '#fff', 6);
            }
          }
        : null,
      dim,
    );
  }

  // ---------------------------------------------------------------- run flow

  startMode(mode: ModeId, players: number): void {
    if (!this.sm.is(GameState.MAIN_MENU, GameState.MODE_SELECT, GameState.RUN_RESULTS)) return;
    const cfg = MODES[mode];
    const save = this.saves.data;
    const pool = cfg.allGames ? this.registry.all() : this.progression.unlocks.unlockedGames(save).map((d) => this.registry.get(d.id)!).filter(Boolean);
    const usable = pool.filter((d) => !this.brokenGames.has(d.id));
    const names = Array.from({ length: players }, (_, i) => (players === 1 ? save.playerName : `P${i + 1}`));
    this.run = new Run(mode, {
      pool: usable.length ? usable : this.registry.all(),
      players,
      playerNames: names,
      adaptive: save.settings.adaptiveDifficulty,
      forcedDifficulty: this.forcedDifficulty,
    });
    if (this.pendingForce) {
      this.run.forceNext(this.pendingForce);
      this.pendingForce = null;
    }
    this.lastRunConfig = { mode, players };
    this.hideMenus();
    this.hud.reset();
    this.music.setMood('game');
    this.beginRound();
  }

  /** Creates the next challenge (or reuses the current one for the next hot-seat player). */
  private beginRound(): void {
    const run = this.run;
    if (!run) return;
    const spec = run.prepareChallenge();
    if (run.isMultiplayer) {
      if (!this.sm.transition(GameState.PLAYER_HANDOFF)) return;
      this.hud.setVisible(false);
      this.handoff.present(run.activePlayer.name, run.activePlayerIndex, spec.def, run.players.map((p) => ({ name: p.name, points: p.points })));
      return;
    }
    this.enterIntro();
  }

  private enterIntro(attempt = 0): void {
    const run = this.run;
    if (!run) return;
    const spec = run.challenge ?? run.prepareChallenge();
    if (!this.setupChallenge(spec)) {
      // Defensive: a broken mini-game is skipped, never crashes the run.
      this.brokenGames.add(spec.def.id);
      if (attempt < 3) {
        const replacement = this.registry.all().find((d) => !this.brokenGames.has(d.id) && d.id !== spec.def.id);
        if (replacement) {
          run.replaceCurrentGame(replacement);
          this.enterIntro(attempt + 1);
          return;
        }
      }
      this.toasts.show('⚠️', 'Challenge failed to load');
      this.quitToMenu();
      return;
    }
    if (!this.sm.transition(GameState.CHALLENGE_INTRO)) {
      log.warn('Could not enter intro from', this.sm.state);
      return;
    }
    this.handoff.hide();
    this.results.hide();
    this.hud.setVisible(true);
    const usesKeys = !spec.def.inputs.includes('text') && !spec.def.inputs.includes('move') && spec.def.inputs.includes('pointer') && !matchMedia('(pointer: coarse)').matches;
    this.intro.present(spec.def, spec.difficulty, spec.modifier, usesKeys && spec.roundIndex === 0);
    this.sfx('whoosh');
    this.scheduleInState(TIMINGS.intro + (spec.roundIndex === 0 ? 0.35 : 0), () => this.startCountdown());
  }

  private setupChallenge(spec: ChallengeSpec): boolean {
    this.teardownChallenge();
    try {
      const world = this.renderer.suggestWorld();
      this.renderer.setWorld(world);
      this.renderer.resetCamera();
      const timer = new ChallengeTimer(spec.def.timeLimit);
      const game = spec.def.create();
      const mod = spec.modifier ? MODIFIERS[spec.modifier] : null;
      const ctx: MiniGameContext = {
        rng: new Random(spec.seed),
        difficulty: spec.difficulty,
        modifier: spec.modifier,
        width: world.width,
        height: world.height,
        speed: mod?.speedMultiplier ?? 1,
        sizeScale: mod?.sizeMultiplier ?? 1,
        input: this.input.snapshot,
        fx: this.createFx(),
        camera: { setZoom: (z) => this.renderer.setZoom(z), pan: (x, y) => this.renderer.pan(x, y) },
        palette: this.palette,
        timeLeft: () => timer.remaining,
        elapsed: () => timer.elapsed,
        t,
      };
      game.initialize(ctx);
      game.prepare();
      this.active = { spec, def: spec.def, game, timer, ended: false };
      timer.onExpire(() => {
        if (this.active?.game === game) game.complete('time');
      });
      return true;
    } catch (err) {
      log.error(`Mini-game ${spec.def.id} failed to initialize`, err);
      this.active = null;
      return false;
    }
  }

  private createFx(): EffectsApi {
    const r = this.renderer;
    return {
      burst: (x, y, color, count) => r.effects.burst(x, y, color, count),
      floatText: (x, y, text, color) => r.effects.floatText(x, y, text, color),
      shake: (i) => r.shake(i),
      flash: (color, strength) => {
        if (!this.saves.data.settings.reducedEffects) r.flash(color, strength);
      },
      sfx: (name) => this.sfx(name),
    };
  }

  private startCountdown(): void {
    if (!this.sm.transition(GameState.COUNTDOWN)) return;
    const step = TIMINGS.countStep;
    ['3', '2', '1'].forEach((n, i) =>
      this.scheduleInState(step * i, () => {
        this.intro.countdown(n, false);
        this.sfx('countdown');
      }),
    );
    this.scheduleInState(step * 3, () => this.activateChallenge());
  }

  private activateChallenge(): void {
    const a = this.active;
    if (!a || !this.sm.transition(GameState.CHALLENGE_ACTIVE)) return;
    this.intro.countdown(t('ui.go'), true);
    this.sfx('go');
    this.scheduler.after(TIMINGS.goHold, () => {
      if (this.active === a) this.intro.hide();
    });
    this.lastUrgentSecond = -1;
    this.input.reverseX = a.spec.modifier === 'reverse';
    this.input.configure(a.def.inputs);
    a.game.start();
    a.timer.start();
    this.events.emit('challengeStarted', a.spec);
  }

  /** Ends the active challenge exactly once, whatever triggered it (timer, success, failure, debug). */
  private endChallenge(): void {
    const a = this.active;
    const run = this.run;
    if (!a || !run || a.ended || !this.sm.is(GameState.CHALLENGE_ACTIVE)) return;
    a.ended = true;
    a.timer.stop();
    if (a.game.state === 'active') a.game.complete('time');
    this.input.configure(null);
    this.input.reverseX = false;
    this.intro.hide();
    this.music.setIntensity(0);

    let score;
    try {
      score = a.game.calculateScore();
    } catch (err) {
      log.error(`Scoring failed for ${a.def.id}`, err);
      score = sanitizeScore(null);
    }
    const outcome = run.recordResult(score);
    this.lastOutcome = outcome;
    const counts = !run.isMultiplayer;
    const progress = this.progression.recordChallenge(this.saves.data, a.def, outcome, counts);
    this.saves.save();

    this.events.emit('challengeEnded', { spec: a.spec, outcome });
    for (const ach of progress.achievements) this.announceAchievement(ach);

    this.sm.transition(GameState.CHALLENGE_RESULTS);
    this.results.present(outcome, {
      previousBest: counts && progress.previousBest > 0 ? progress.previousBest : null,
      newBest: counts && progress.newGameBest,
      playerName: run.isMultiplayer ? run.players[outcome.playerIndex].name : null,
      finishReason: a.game.finishReason,
    });
    this.celebrate(outcome);
    const hold = progress.newGameBest || progress.achievements.length ? TIMINGS.resultsExtended : TIMINGS.results;
    this.scheduleInState(hold, () => this.advanceFromResults());
  }

  private celebrate(outcome: RoundOutcome): void {
    const r = this.renderer;
    const w = r.worldSize;
    const p = this.palette;
    if (outcome.perfect) {
      this.sfx('perfect');
      r.effects.confetti(w.width, [p.a, p.b, p.c, p.d, p.accent], 140);
      r.shake(10);
    } else if (outcome.failed) {
      this.sfx(this.active?.game.finishReason === 'time' ? 'timeup' : 'fail');
      if (outcome.lostLife) setTimeout(() => this.sfx('life_lost'), 250);
    } else {
      this.sfx(this.active?.game.finishReason === 'time' ? 'timeup' : 'success');
      r.effects.burst(w.width / 2, w.height / 2, p.accent, 30);
    }
    if (outcome.comboAfter > outcome.comboBefore && outcome.comboAfter > 1) setTimeout(() => this.sfx('combo'), 180);
  }

  private advanceFromResults(): void {
    if (!this.sm.is(GameState.CHALLENGE_RESULTS)) return;
    const run = this.run;
    this.results.hide();
    this.teardownChallenge();
    if (!run || !this.sm.transition(GameState.ROUND_TRANSITION)) return;
    if (run.isOver()) this.finishRun();
    else this.beginRound();
  }

  private finishRun(): void {
    const run = this.run;
    if (!run || !this.sm.transition(GameState.RUN_RESULTS)) return;
    this.hud.setVisible(false);
    this.music.setMood('menu');
    const summary = run.summary();
    let progress: RunProgress | null = null;
    try {
      progress = this.progression.recordRun(this.saves.data, summary, TITLE_ORDER);
      this.saves.save();
    } catch (err) {
      log.error('Failed to record run', err);
    }
    this.events.emit('runCompleted', { summary, progress });
    if (progress?.newBestScore) setTimeout(() => this.sfx('record'), 300);
    if (progress) for (const ach of progress.achievements) this.events.emit('achievementUnlocked', ach);
    this.finalResults.present(summary, progress, null);
    if (progress?.newBestScore || summary.players.length > 1) {
      this.renderer.effects.confetti(this.renderer.worldSize.width, [this.palette.a, this.palette.b, this.palette.c, this.palette.accent], 160);
    }
    const submission = submissionFromRun(summary, this.saves.data.playerName);
    if (submission) {
      void this.leaderboard.submit(submission).then((res) => {
        if (res.ok && this.sm.is(GameState.RUN_RESULTS)) this.finalResults.present(summary, progress, res.rank);
      });
    }
  }

  private teardownChallenge(): void {
    const a = this.active;
    if (!a) return;
    try {
      a.timer.stop();
      if (a.game.state === 'active' || a.game.state === 'prepared') a.game.complete('aborted');
      a.game.cleanup();
    } catch (err) {
      log.error(`Cleanup failed for ${a.def.id}`, err);
    }
    this.active = null;
    this.input.configure(null);
    this.input.reverseX = false;
    this.renderer.resetCamera();
    this.renderer.effects.clear();
  }

  /** Schedules work that is cancelled automatically if the state changes before it fires. */
  private scheduleInState(delay: number, fn: () => void): void {
    const state = this.sm.state;
    const enteredAt = this.stateEnteredAt;
    this.scheduler.after(delay, () => {
      if (this.sm.state === state && this.stateEnteredAt === enteredAt) fn();
    });
  }

  // ---------------------------------------------------------------- UIActions

  advance(): void {
    const sinceEnter = this.clock - this.stateEnteredAt;
    switch (this.sm.state) {
      case GameState.CHALLENGE_INTRO:
        if (sinceEnter >= TIMINGS.introMinShow) this.startCountdown();
        break;
      case GameState.CHALLENGE_RESULTS:
        if (sinceEnter >= TIMINGS.resultsMinShow) this.advanceFromResults();
        break;
      case GameState.PLAYER_HANDOFF:
        this.sfx('click');
        this.enterIntro();
        break;
      default:
        break;
    }
  }

  private back(): void {
    if (this.sm.is(GameState.MODE_SELECT, GameState.SETTINGS, GameState.STATS, GameState.ACHIEVEMENTS)) this.openScreen('MAIN_MENU');
    else if (this.sm.is(GameState.PAUSED)) this.resume();
  }

  private handlePauseKey(): void {
    if (this.sm.is(GameState.PAUSED)) this.resume();
    else if (this.sm.is(GameState.MODE_SELECT, GameState.SETTINGS, GameState.STATS, GameState.ACHIEVEMENTS)) this.openScreen('MAIN_MENU');
    else this.pause();
  }

  pause(): void {
    if (!this.run || !this.run.mode.allowPause) return;
    if (!this.sm.pause()) return;
    this.active?.timer.pause();
    this.input.configure(null);
    document.body.classList.add('paused');
    this.pauseOverlay.show();
    this.music.setMood('menu');
  }

  resume(): void {
    if (!this.sm.resume()) return;
    document.body.classList.remove('paused');
    this.pauseOverlay.hide();
    this.music.setMood('game');
    const a = this.active;
    if (a && this.sm.is(GameState.CHALLENGE_ACTIVE)) {
      this.input.reverseX = a.spec.modifier === 'reverse';
      this.input.configure(a.def.inputs);
      a.timer.resume();
    }
  }

  quitToMenu(): void {
    if (!this.sm.transition(GameState.MAIN_MENU)) return;
    this.scheduler.clear();
    this.teardownChallenge();
    this.run = null;
    document.body.classList.remove('paused');
    this.pauseOverlay.hide();
    this.intro.hide();
    this.results.hide();
    this.handoff.hide();
    this.finalResults.hide();
    this.hud.setVisible(false);
    this.showMenu('MAIN_MENU');
  }

  restartRun(): void {
    const cfg = this.lastRunConfig;
    this.quitToMenu();
    if (cfg) this.startMode(cfg.mode, cfg.players);
  }

  playAgain(): void {
    const cfg = this.lastRunConfig;
    if (!cfg || !this.sm.is(GameState.RUN_RESULTS)) return;
    this.finalResults.hide();
    this.startMode(cfg.mode, cfg.players);
  }

  openScreen(screen: MenuScreenId, mode?: ModeId): void {
    const from = this.sm.state;
    if (from === GameState.RUN_RESULTS) {
      this.finalResults.hide();
      this.run = null;
    }
    if (from !== screen && !this.sm.transition(GameState[screen])) return;
    this.showMenu(screen, mode);
  }

  private showMenu(screen: MenuScreenId, mode?: ModeId): void {
    this.hideMenus();
    this.music.setMood('menu');
    if (screen === 'MODE_SELECT') this.modeSelect.open(mode ?? 'duel');
    else this.screens[screen].show();
  }

  private hideMenus(): void {
    for (const s of Object.values(this.screens)) s.hide();
  }

  updateSettings(patch: Partial<Settings>): void {
    const next = sanitizeSettings({ ...this.saves.data.settings, ...patch });
    this.saves.update((d) => (d.settings = next));
    this.applySettings(next);
  }

  setPlayerName(name: string): void {
    const clean = name.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 12);
    if (clean) this.saves.update((d) => (d.playerName = clean));
  }

  resetProgress(): void {
    this.saves.reset();
    this.progression.initialize(this.saves.data);
    this.saves.save();
    this.applySettings(this.saves.data.settings);
  }

  uiSound(name: 'click' | 'hover'): void {
    this.sfx(name);
  }

  private sfx(name: SoundName): void {
    this.audio.play(name);
  }

  private applySettings(s: Settings): void {
    this.audio.applySettings(s);
    const theme = getTheme(s.highContrast ? 'contrast' : s.theme);
    let palette = theme.palette;
    if (s.colorBlind) palette = applyColorBlind(palette);
    this.palette = palette;
    const rootStyle = document.documentElement.style;
    for (const [k, v] of Object.entries(theme.css)) rootStyle.setProperty(k, v);
    rootStyle.setProperty('--good', palette.good);
    rootStyle.setProperty('--bad', palette.bad);
    rootStyle.setProperty('--text-scale', String(s.textScale));
    document.body.classList.toggle('reduced-effects', s.reducedEffects);
    document.body.classList.toggle('high-contrast', s.highContrast);
    this.renderer.background = palette.bg;
    this.renderer.gridColor = palette.grid;
    this.renderer.reducedShake = s.reducedShake;
    this.renderer.effects.intensity = s.reducedEffects ? 0.25 : 1;
  }

  private announceAchievement(def: AchievementDef): void {
    this.toasts.show(def.icon, t('ach.unlocked_toast'), t(def.nameKey));
    setTimeout(() => this.sfx('achievement'), 400);
    this.events.emit('achievementUnlocked', def);
  }

  private updateHud(): void {
    const run = this.run;
    const a = this.active;
    if (!run) return;
    const p = run.players[this.lastOutcome && this.sm.is(GameState.CHALLENGE_RESULTS) ? this.lastOutcome.playerIndex : run.activePlayerIndex];
    this.hud.setState({
      round: run.displayRound,
      totalRounds: run.totalRounds,
      points: p.points,
      combo: p.combo,
      lives: p.lives,
      maxLives: run.mode.lives,
      playerName: run.isMultiplayer ? p.name : null,
      playerIndex: run.players.indexOf(p),
    });
    if (a) this.hud.setTimer(a.timer.display(), a.timer.progress, a.timer.remaining, this.sm.is(GameState.CHALLENGE_ACTIVE));
  }

  // ---------------------------------------------------------------- debug API

  get debugInfo() {
    const a = this.active;
    return {
      state: this.sm.state,
      fps: this.loop.fps,
      timer: a ? a.timer.display() : '-',
      game: a?.def.id ?? '-',
      difficulty: a?.spec.difficulty ?? null,
      modifier: a?.spec.modifier ?? null,
      particles: this.renderer.effects.particleCount,
      round: this.run?.round ?? 0,
    };
  }

  setDebugOverlay(key: keyof Game['debugOverlay'], on: boolean): void {
    this.debugOverlay[key] = on;
    this.debugReadout.classList.toggle('visible', Object.values(this.debugOverlay).some(Boolean));
  }

  private updateDebugReadout(): void {
    if (!this.debugReadout.classList.contains('visible')) return;
    const info = this.debugInfo;
    const lines: string[] = [];
    if (this.debugOverlay.fps) lines.push(`FPS ${info.fps.toFixed(0)} · particles ${info.particles}`);
    if (this.debugOverlay.state) lines.push(`STATE ${info.state} · ${info.game} · d${info.difficulty ?? '-'} ${info.modifier ?? ''}`);
    if (this.debugOverlay.timer) lines.push(`TIMER ${info.timer}`);
    this.debugReadout.textContent = lines.join('\n');
  }

  debugSkip(): void {
    const a = this.active;
    if (a && this.sm.is(GameState.CHALLENGE_ACTIVE)) {
      a.game.complete('aborted');
      this.endChallenge();
    } else if (this.sm.is(GameState.CHALLENGE_RESULTS)) {
      this.advanceFromResults();
    }
  }

  debugRestartChallenge(): void {
    if (!this.run?.challenge || !this.sm.is(GameState.CHALLENGE_ACTIVE, GameState.COUNTDOWN)) return;
    this.scheduler.clear();
    this.teardownChallenge();
    this.enterIntro();
  }

  debugForce(id: string): void {
    const def = this.registry.get(id);
    if (!def) return;
    if (!this.run) {
      this.pendingForce = def;
      this.startMode('quick', 1);
      return;
    }
    this.run.forceNext(def);
    this.toasts.show('🛠', `Next: ${t(def.nameKey)}`);
  }

  debugSetDifficulty(d: Difficulty | null): void {
    this.forcedDifficulty = d;
    if (this.run) this.run.forcedDifficulty = d;
  }

  debugAddScore(points: number): void {
    if (this.run) this.run.activePlayer.points += points;
  }

  debugResetSave(): void {
    this.resetProgress();
    this.toasts.show('🛠', 'Save reset');
  }

  debugUnlockAll(): void {
    this.progression.unlocks.unlockEverything(this.saves.data);
    this.saves.save();
    this.toasts.show('🛠', 'Everything unlocked');
  }

  get analyticsLog() {
    return this.analytics instanceof DebugAnalytics ? this.analytics.events : [];
  }
}
