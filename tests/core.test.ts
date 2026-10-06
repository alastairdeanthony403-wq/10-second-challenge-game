import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/core/EventBus';
import { GameState, StateMachine, TRANSITIONS } from '../src/core/GameState';
import { Pool } from '../src/core/Pool';
import { Random, dateKey, dateSeed } from '../src/core/Random';
import { ChallengeTimer, Scheduler } from '../src/core/Timer';

describe('StateMachine', () => {
  it('starts in BOOT and follows legal transitions', () => {
    const sm = new StateMachine();
    expect(sm.state).toBe(GameState.BOOT);
    expect(sm.transition(GameState.MAIN_MENU)).toBe(true);
    expect(sm.transition(GameState.CHALLENGE_INTRO)).toBe(true);
    expect(sm.transition(GameState.COUNTDOWN)).toBe(true);
    expect(sm.transition(GameState.CHALLENGE_ACTIVE)).toBe(true);
    expect(sm.transition(GameState.CHALLENGE_RESULTS)).toBe(true);
    expect(sm.transition(GameState.ROUND_TRANSITION)).toBe(true);
    expect(sm.transition(GameState.RUN_RESULTS)).toBe(true);
  });

  it('rejects illegal and duplicate transitions', () => {
    const sm = new StateMachine();
    expect(sm.transition(GameState.CHALLENGE_ACTIVE)).toBe(false);
    sm.transition(GameState.MAIN_MENU);
    expect(sm.transition(GameState.MAIN_MENU)).toBe(false);
    expect(sm.transition(GameState.CHALLENGE_RESULTS)).toBe(false);
    expect(sm.transition(GameState.RUN_RESULTS)).toBe(false);
  });

  it('results cannot start twice', () => {
    const sm = new StateMachine();
    [GameState.MAIN_MENU, GameState.CHALLENGE_INTRO, GameState.COUNTDOWN, GameState.CHALLENGE_ACTIVE].forEach((s) => sm.transition(s));
    expect(sm.transition(GameState.CHALLENGE_RESULTS)).toBe(true);
    expect(sm.transition(GameState.CHALLENGE_RESULTS)).toBe(false);
  });

  it('pause only resumes to the interrupted state', () => {
    const sm = new StateMachine();
    [GameState.MAIN_MENU, GameState.CHALLENGE_INTRO, GameState.COUNTDOWN, GameState.CHALLENGE_ACTIVE].forEach((s) => sm.transition(s));
    expect(sm.pause()).toBe(true);
    expect(sm.state).toBe(GameState.PAUSED);
    expect(sm.transition(GameState.COUNTDOWN)).toBe(false);
    expect(sm.transition(GameState.CHALLENGE_RESULTS)).toBe(false);
    expect(sm.resume()).toBe(true);
    expect(sm.state).toBe(GameState.CHALLENGE_ACTIVE);
    expect(sm.resume()).toBe(false);
  });

  it('cannot pause from menus or pause twice', () => {
    const sm = new StateMachine();
    sm.transition(GameState.MAIN_MENU);
    expect(sm.pause()).toBe(false);
    [GameState.CHALLENGE_INTRO].forEach((s) => sm.transition(s));
    expect(sm.pause()).toBe(true);
    expect(sm.pause()).toBe(false);
  });

  it('allows quitting to the menu while paused', () => {
    const sm = new StateMachine();
    [GameState.MAIN_MENU, GameState.CHALLENGE_INTRO].forEach((s) => sm.transition(s));
    sm.pause();
    expect(sm.transition(GameState.MAIN_MENU)).toBe(true);
    expect(sm.pausedFrom).toBeNull();
  });

  it('notifies listeners once per transition', () => {
    const sm = new StateMachine();
    const spy = vi.fn();
    sm.onChange(spy);
    sm.transition(GameState.MAIN_MENU);
    sm.transition(GameState.MAIN_MENU);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ from: GameState.BOOT, to: GameState.MAIN_MENU });
  });

  it('every state has an exit (no dead ends)', () => {
    for (const s of Object.values(GameState)) expect(TRANSITIONS[s].length).toBeGreaterThan(0);
  });
});

describe('ChallengeTimer', () => {
  it('starts at the full duration and counts down with delta time', () => {
    const t = new ChallengeTimer(10);
    expect(t.display()).toBe('10.0');
    t.start();
    t.update(0.25);
    expect(t.remaining).toBeCloseTo(9.75);
    expect(t.display()).toBe('9.8');
  });

  it('does not run until started', () => {
    const t = new ChallengeTimer(10);
    t.update(5);
    expect(t.remaining).toBe(10);
  });

  it('never goes negative and expires exactly once', () => {
    const t = new ChallengeTimer(10);
    const onExpire = vi.fn();
    t.onExpire(onExpire);
    t.start();
    t.update(9.95);
    expect(onExpire).not.toHaveBeenCalled();
    t.update(1);
    t.update(1);
    expect(t.remaining).toBe(0);
    expect(t.isExpired).toBe(true);
    expect(t.display()).toBe('0.0');
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('accumulates many small frames without drifting', () => {
    const t = new ChallengeTimer(10);
    const onExpire = vi.fn();
    t.onExpire(onExpire);
    t.start();
    let frames = 0;
    while (!t.isExpired && frames < 10000) {
      t.update(1 / 60);
      frames++;
    }
    expect(frames).toBeGreaterThanOrEqual(599);
    expect(frames).toBeLessThanOrEqual(601);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('pauses and resumes', () => {
    const t = new ChallengeTimer(10);
    t.start();
    t.update(1);
    t.pause();
    t.update(5);
    expect(t.remaining).toBeCloseTo(9);
    t.resume();
    t.update(1);
    expect(t.remaining).toBeCloseTo(8);
  });

  it('ignores invalid deltas', () => {
    const t = new ChallengeTimer(10);
    t.start();
    t.update(-5);
    t.update(Number.NaN);
    t.update(Infinity);
    expect(t.remaining).toBe(10);
  });

  it('stop() ends without firing expiry', () => {
    const t = new ChallengeTimer(10);
    const onExpire = vi.fn();
    t.onExpire(onExpire);
    t.start();
    t.stop();
    t.update(20);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('displays the final tenths correctly', () => {
    const t = new ChallengeTimer(10);
    t.start();
    t.update(9.85);
    expect(t.display()).toBe('0.2');
    t.update(0.1);
    expect(t.display()).toBe('0.1');
  });

  it('rejects invalid durations', () => {
    expect(() => new ChallengeTimer(0)).toThrow();
  });
});

describe('Scheduler', () => {
  it('runs tasks in time order only as game time advances', () => {
    const s = new Scheduler();
    const order: string[] = [];
    s.after(0.5, () => order.push('b'));
    s.after(0.2, () => order.push('a'));
    s.update(0.1);
    expect(order).toEqual([]);
    s.update(0.5);
    expect(order).toEqual(['a', 'b']);
    expect(s.pending).toBe(0);
  });

  it('can cancel and clear', () => {
    const s = new Scheduler();
    const fn = vi.fn();
    const id = s.after(0.1, fn);
    s.cancel(id);
    s.after(0.1, fn);
    s.clear();
    s.update(1);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('Random', () => {
  it('is deterministic per seed', () => {
    const a = new Random(42);
    const b = new Random(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('stays in range', () => {
    const r = new Random(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(3, 6);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(6);
    }
  });

  it('weighted picks respect weights', () => {
    const r = new Random(1);
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 5000; i++) counts[r.weighted(['a', 'b'] as const, (x) => (x === 'a' ? 9 : 1))]++;
    expect(counts.a).toBeGreaterThan(counts.b * 5);
  });

  it('daily seed is YYYYMMDD', () => {
    const d = new Date(2026, 9, 6);
    expect(dateSeed(d)).toBe(20261006);
    expect(dateKey(d)).toBe('20261006');
  });
});

describe('Pool', () => {
  it('reuses released objects', () => {
    let created = 0;
    const pool = new Pool(() => ({ id: created++ }), () => {}, 2);
    const a = pool.acquire();
    pool.release(a);
    const b = pool.acquire();
    expect(b).toBe(a);
    expect(created).toBe(2);
  });

  it('releaseAll empties the active list', () => {
    const pool = new Pool(() => ({}), () => {});
    pool.acquire();
    pool.acquire();
    pool.releaseAll();
    expect(pool.size).toBe(0);
    expect(pool.freeCount).toBe(2);
  });
});

describe('EventBus', () => {
  it('subscribes, emits and unsubscribes without duplicates', () => {
    const bus = new EventBus<{ ping: number }>();
    const fn = vi.fn();
    const off = bus.on('ping', fn);
    bus.on('ping', fn);
    bus.emit('ping', 1);
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    bus.emit('ping', 2);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(bus.listenerCount('ping')).toBe(0);
  });

  it('a throwing handler does not break others', () => {
    const bus = new EventBus<{ ping: number }>();
    const ok = vi.fn();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    bus.on('ping', () => {
      throw new Error('boom');
    });
    bus.on('ping', ok);
    bus.emit('ping', 1);
    expect(ok).toHaveBeenCalled();
    spy.mockRestore();
  });
});
