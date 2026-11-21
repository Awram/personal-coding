// Persistent stats and spaced-repetition scheduling (Leitner boxes).

const KEY = 'globe-trainer:v1';
const DAY = 24 * 60 * 60 * 1000;
// How long to wait before a country comes back, per box.
const BOX_INTERVALS = [0, 10 * 60 * 1000, DAY, 3 * DAY, 7 * DAY, 21 * DAY];
export const MAX_BOX = BOX_INTERVALS.length - 1;
export const SKILLS = ['locate', 'name', 'hunt'];

function emptyState() {
  return {
    cards: {}, // `${skill}:${id}` -> { box, due, seen, correct, lastSeen }
    hunt: { played: 0, won: 0, guesses: 0, best: null, history: [] },
    daily: {}, // date -> { id, guesses, done, hints, list }
    streak: { current: 0, best: 0, lastDate: null },
    settings: {},
  };
}

export class Progress {
  constructor(storage = safeStorage()) {
    this.storage = storage;
    this.state = this._load();
  }

  _load() {
    try {
      const raw = this.storage.getItem(KEY);
      if (!raw) return emptyState();
      return { ...emptyState(), ...JSON.parse(raw) };
    } catch {
      return emptyState();
    }
  }

  save() {
    try {
      this.storage.setItem(KEY, JSON.stringify(this.state));
    } catch {
      /* storage full or blocked: progress just won't persist */
    }
  }

  card(skill, id) {
    return this.state.cards[`${skill}:${id}`];
  }

  /**
   * Record an answer. `quality` is 0 (failed), 1 (got there with help) or 2 (first try).
   */
  record(skill, id, quality, now = Date.now()) {
    const k = `${skill}:${id}`;
    const c = this.state.cards[k] || { box: 0, due: 0, seen: 0, correct: 0, lastSeen: 0 };
    c.seen += 1;
    c.lastSeen = now;
    if (quality === 2) {
      c.correct += 1;
      c.box = Math.min(MAX_BOX, c.box + 1);
    } else if (quality === 1) {
      c.box = Math.max(1, c.box); // stay put, but at least box 1
    } else {
      c.box = 1;
    }
    c.due = now + BOX_INTERVALS[c.box];
    this.state.cards[k] = c;
    this.save();
    return c;
  }

  /** 0..1 mastery for a country in a skill. */
  mastery(skill, id) {
    const c = this.card(skill, id);
    return c ? c.box / MAX_BOX : 0;
  }

  /**
   * Pick the next country to study from a pool. Overdue weak cards first, then
   * new ones, then whatever is due soonest. A little randomness avoids repetition.
   */
  pickNext(skill, pool, { avoid = [], now = Date.now(), rng = Math.random } = {}) {
    const candidates = pool.filter((c) => !avoid.includes(c.id));
    const list = candidates.length ? candidates : pool;
    const due = [];
    const fresh = [];
    const later = [];
    for (const c of list) {
      const card = this.card(skill, c.id);
      if (!card) fresh.push(c);
      else if (card.due <= now) due.push({ c, card });
      else later.push({ c, card });
    }
    if (due.length && (rng() < 0.75 || !fresh.length)) {
      due.sort((a, b) => a.card.box - b.card.box || a.card.due - b.card.due);
      const top = due.slice(0, Math.max(3, Math.ceil(due.length / 4)));
      return top[Math.floor(rng() * top.length)].c;
    }
    if (fresh.length) return fresh[Math.floor(rng() * fresh.length)];
    later.sort((a, b) => a.card.due - b.card.due);
    const top = later.slice(0, 5);
    return top[Math.floor(rng() * top.length)].c;
  }

  summary(skill, pool, now = Date.now()) {
    let mastered = 0;
    let learning = 0;
    let due = 0;
    for (const c of pool) {
      const card = this.card(skill, c.id);
      if (!card) continue;
      if (card.box >= 4) mastered++;
      else learning++;
      if (card.due <= now) due++;
    }
    return { total: pool.length, mastered, learning, unseen: pool.length - mastered - learning, due };
  }

  /** Countries with the lowest success rate in a skill (seen at least once). */
  weakest(skill, pool, n = 8) {
    return pool
      .map((c) => ({ c, card: this.card(skill, c.id) }))
      .filter((x) => x.card && x.card.box < MAX_BOX)
      .sort((a, b) => a.card.box - b.card.box || a.card.correct / a.card.seen - b.card.correct / b.card.seen)
      .slice(0, n)
      .map((x) => x.c);
  }

  recordHunt(id, guesses, won, hintsUsed) {
    const h = this.state.hunt;
    h.played += 1;
    if (won) {
      h.won += 1;
      h.guesses += guesses;
      h.best = h.best == null ? guesses : Math.min(h.best, guesses);
    }
    h.history.push({ id, guesses, won, hints: hintsUsed, at: Date.now() });
    if (h.history.length > 200) h.history.shift();
    // Hunting a country quickly says you know where it sits relative to others.
    const q = !won ? 0 : guesses <= 4 && !hintsUsed ? 2 : 1;
    this.record('hunt', id, q);
    this.save();
  }

  getDaily(date) {
    return this.state.daily[date];
  }

  setDaily(date, data) {
    this.state.daily[date] = data;
    if (data.done && data.won) {
      const s = this.state.streak;
      if (s.lastDate !== date) {
        s.current = s.lastDate === previousDate(date) ? s.current + 1 : 1;
        s.best = Math.max(s.best, s.current);
        s.lastDate = date;
      }
    }
    this.save();
  }

  getSetting(k, fallback) {
    return this.state.settings[k] ?? fallback;
  }

  setSetting(k, v) {
    this.state.settings[k] = v;
    this.save();
  }

  reset() {
    this.state = emptyState();
    this.save();
  }
}

export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function previousDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return todayKey(new Date(y, m - 1, d - 1));
}

/** Deterministic pick for the daily puzzle, so it's the same all day. */
export function dailyPick(pool, dateKey) {
  let h = 2166136261;
  for (const ch of `globe-trainer:${dateKey}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  const sorted = [...pool].sort((a, b) => (a.id < b.id ? -1 : 1));
  return sorted[(h >>> 0) % sorted.length];
}

function safeStorage() {
  try {
    const s = window.localStorage;
    s.getItem('x');
    return s;
  } catch {
    const mem = new Map();
    return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  }
}
