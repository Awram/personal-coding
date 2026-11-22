import { describe, it, expect } from 'vitest';
import { Progress, dailyPick, previousDate } from '../src/progress.js';

const mem = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
};
const pool = ['AAA', 'BBB', 'CCC', 'DDD'].map((id) => ({ id }));

describe('spaced repetition', () => {
  it('moves cards up on success and back to box 1 on failure', () => {
    const p = new Progress(mem());
    p.record('locate', 'AAA', 2);
    p.record('locate', 'AAA', 2);
    expect(p.card('locate', 'AAA').box).toBe(2);
    p.record('locate', 'AAA', 0);
    expect(p.card('locate', 'AAA').box).toBe(1);
  });

  it('prefers due cards, then unseen ones', () => {
    const p = new Progress(mem());
    const now = 1_000_000;
    for (const c of pool) {
      p.record('name', c.id, 2, now);
      p.record('name', c.id, 2, now);
    }
    p.record('name', 'CCC', 0, now);
    // Eleven minutes later only CCC (back in box 1) is due; the rest wait a day.
    const pick = p.pickNext('name', pool, { now: now + 11 * 60 * 1000, rng: () => 0 });
    expect(pick.id).toBe('CCC');
    const fresh = p.pickNext('name', [...pool, { id: 'EEE' }], { now: now + 60 * 1000, rng: () => 0.99 });
    expect(fresh.id).toBe('EEE');
  });

  it('persists across instances', () => {
    const s = mem();
    new Progress(s).record('hunt', 'AAA', 2);
    expect(new Progress(s).card('hunt', 'AAA').seen).toBe(1);
  });
});

describe('daily', () => {
  it('is stable for a date and varies across dates', () => {
    expect(dailyPick(pool, '2026-01-01').id).toBe(dailyPick(pool, '2026-01-01').id);
    const picks = new Set(Array.from({ length: 20 }, (_, i) => dailyPick(pool, `2026-02-${String(i + 1).padStart(2, '0')}`).id));
    expect(picks.size).toBeGreaterThan(1);
  });

  it('streak tracking knows yesterday', () => {
    expect(previousDate('2026-03-01')).toBe('2026-02-28');
    const p = new Progress(mem());
    p.setDaily('2026-03-01', { done: true, won: true });
    p.setDaily('2026-03-02', { done: true, won: true });
    expect(p.state.streak.current).toBe(2);
    p.setDaily('2026-03-05', { done: true, won: true });
    expect(p.state.streak.current).toBe(1);
  });
});

describe('daily scoring and streaks', () => {
  it('scores guesses plus two per hint', async () => {
    const { huntScore } = await import('../src/progress.js');
    expect(huntScore(4, 0)).toBe(4);
    expect(huntScore(4, 2)).toBe(8);
  });

  it('giving up resets the streak, and it lapses after a missed day', () => {
    const p = new Progress(mem());
    p.setDaily('2026-03-01', { done: true, won: true, list: ['A'], hints: [] });
    p.setDaily('2026-03-02', { done: true, won: true, list: ['A', 'B'], hints: ['region'] });
    expect(p.currentStreak('2026-03-02')).toBe(2);
    expect(p.currentStreak('2026-03-03')).toBe(2);
    expect(p.currentStreak('2026-03-04')).toBe(0);
    p.setDaily('2026-03-03', { done: true, won: false, list: ['A'], hints: [] });
    expect(p.currentStreak('2026-03-03')).toBe(0);
    expect(p.state.streak.best).toBe(2);
  });

  it('saving the same day twice does not double count', () => {
    const p = new Progress(mem());
    p.setDaily('2026-03-01', { done: true, won: true, list: ['A'], hints: [] });
    p.setDaily('2026-03-01', { done: true, won: true, list: ['A'], hints: [], quiz: {} });
    expect(p.state.streak.current).toBe(1);
  });

  it('summarises dailies and unlocks after the first', () => {
    const p = new Progress(mem());
    expect(p.isUnlocked()).toBe(false);
    p.setDaily('2026-03-01', { done: true, won: true, list: ['A', 'B', 'C'], hints: [] });
    p.setDaily('2026-03-02', { done: true, won: true, list: ['A', 'B'], hints: ['size'] });
    p.setDaily('2026-03-03', { done: true, won: false, list: ['A'], hints: [] });
    const s = p.dailyStats();
    expect(p.isUnlocked()).toBe(true);
    expect(s).toMatchObject({ played: 3, won: 2, best: 3, average: 3.5, unassisted: 1 });
  });
});
