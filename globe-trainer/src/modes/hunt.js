// Hunt: guess the mystery country. Each guess is coloured by how close it is,
// with distance, compass direction and a proximity score.
import { heatColor, proximity, compassPoint } from '../geo.js';
import { dailyPick, todayKey } from '../progress.js';
import { h, esc, autocomplete, arrow, factsCard, distanceText } from '../ui/components.js';

const HINTS = [
  { id: 'region', label: 'Region', text: (t) => `It's in ${t.subregion || t.region}.` },
  { id: 'size', label: 'Size', text: (t) => `It covers about ${roundArea(t.area)} km²${t.landlocked ? ' and is landlocked' : ''}.` },
  { id: 'letter', label: 'First letter', text: (t) => `The name starts with “${t.name[0]}”.` },
  { id: 'capital', label: 'Capital', text: (t) => `The capital is ${t.capital[0] || 'not defined'}.` },
];

function roundArea(a) {
  if (a > 1e6) return `${(a / 1e6).toFixed(1)} million`;
  if (a > 1e4) return `${Math.round(a / 1000).toLocaleString()},000`;
  return Math.round(a).toLocaleString();
}

export class HuntMode {
  constructor(app) {
    this.app = app;
    this.variant = app.progress.getSetting('huntVariant', 'daily');
  }

  mount(panel) {
    this.panel = panel;
    this.newGame();
  }

  onSettingsChange() {
    this.render();
    this.updateGlobe();
  }

  newGame(forcePractice = false) {
    const { progress, world } = this.app;
    if (forcePractice) this.variant = 'practice';
    this.guesses = [];
    this.hints = [];
    this.done = false;
    this.won = false;
    if (this.variant === 'daily') {
      this.dateKey = todayKey();
      const pool = world.pool({ region: 'world' });
      this.target = dailyPick(pool, this.dateKey);
      const saved = progress.getDaily(this.dateKey);
      if (saved && saved.id === this.target.id) {
        this.guesses = saved.list.map((id) => this.scoreGuess(world.get(id))).filter(Boolean);
        this.hints = saved.hints || [];
        this.done = saved.done;
        this.won = saved.won;
      }
    } else {
      this.target = progress.pickNext('hunt', this.app.pool(), { avoid: this.recent || [] });
      this.recent = [...(this.recent || []).slice(-10), this.target.id];
    }
    this.app.globe.autoRotate = !this.guesses.length;
    this.render();
    this.updateGlobe();
    if (this.done) this.app.globe.flyToCountry(this.target);
  }

  scoreGuess(c) {
    if (!c) return null;
    const { world } = this.app;
    const km = world.distance(c, this.target);
    return { country: c, km, bearing: world.bearing(c, this.target), pct: c.id === this.target.id ? 100 : proximity(km) };
  }

  guess(c, raw) {
    if (this.done) return;
    if (!c) return this.app.toast(`Couldn't find “${raw}”. Try another spelling.`);
    if (this.guesses.some((g) => g.country.id === c.id)) return this.app.toast(`Already guessed ${c.name}.`);
    if (c.id === 'ATA') return this.app.toast('Antarctica is never the answer.');
    const g = this.scoreGuess(c);
    this.guesses.push(g);
    if (c.id === this.target.id) this.finish(true);
    this.persist();
    this.render();
    this.updateGlobe();
    if (!this.done) this.app.globe.flyToCountry(c);
    this.ac?.focus();
  }

  finish(won) {
    this.done = true;
    this.won = won;
    this.app.progress.recordHunt(this.target.id, this.guesses.length, won, this.hints.length);
    this.app.globe.flyToCountry(this.target);
  }

  persist() {
    if (this.variant !== 'daily') return;
    this.app.progress.setDaily(this.dateKey, {
      id: this.target.id,
      list: this.guesses.map((g) => g.country.id),
      hints: this.hints,
      done: this.done,
      won: this.won,
    });
  }

  useHint(id) {
    if (this.hints.includes(id) || this.done) return;
    this.hints.push(id);
    this.persist();
    this.render();
  }

  giveUp() {
    if (this.done) return;
    this.finish(false);
    this.persist();
    this.render();
    this.updateGlobe();
  }

  updateGlobe() {
    const styles = new Map();
    const labels = this.app.settings.labels;
    for (const g of this.guesses) {
      const win = g.country.id === this.target.id;
      styles.set(g.country.id, {
        fill: heatColor(g.km),
        stroke: win ? '#ffc94a' : 'rgba(0,0,0,0.55)',
        strokeWidth: win ? 2 : 0.8,
        label: labels ? g.country.name : null,
        pulse: win,
      });
    }
    if (this.done && !this.won) {
      styles.set(this.target.id, { fill: '#ffc94a', stroke: '#fff', strokeWidth: 1.5, label: this.target.name, pulse: true });
    }
    this.app.globe.setStyles(styles);
  }

  render() {
    const { settings, progress, world } = this.app;
    const units = settings.units;
    const sorted = [...this.guesses].sort((a, b) => a.km - b.km);
    const closest = sorted.find((g) => g.country.id !== this.target.id);
    const streak = progress.state.streak;
    const dailyDone = this.variant === 'daily' && this.done;

    this.panel.innerHTML = '';
    const head = h(`
      <div class="card">
        <div class="row between">
          <div class="seg" role="group" aria-label="Hunt type">
            <button data-v="daily" aria-pressed="${this.variant === 'daily'}">Daily</button>
            <button data-v="practice" aria-pressed="${this.variant === 'practice'}">Practice</button>
          </div>
          <span class="muted small">${
            this.variant === 'daily' ? `Streak ${streak.current} · best ${streak.best}` : esc(this.app.regionLabel())
          }</span>
        </div>
        <p class="muted small" style="margin:10px 0 0">
          Find the mystery country. Each guess shows how far its nearest border is from the target,
          which way to head, and gets hotter the closer you are.
        </p>
      </div>`);
    head.querySelector('.seg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (!b || b.dataset.v === this.variant) return;
      this.variant = b.dataset.v;
      progress.setSetting('huntVariant', this.variant);
      this.newGame();
    });
    this.panel.append(head);

    if (!this.done) {
      const play = h(`<div class="card"><div class="row between" style="margin-bottom:8px">
          <strong>Guess ${this.guesses.length + 1}</strong>
          <button class="btn ghost small" data-act="giveup">Give up</button>
        </div></div>`);
      this.ac = autocomplete({ index: this.app.index, onSubmit: (c, raw) => this.guess(c, raw) });
      play.append(this.ac.el);
      if (closest) {
        play.append(
          h(`<div class="closest" style="margin-top:10px">
              <span class="muted">Closest</span><strong>${esc(closest.country.name)}</strong>
              <div class="meter"><span style="width:${closest.pct}%;background:${heatColor(closest.km)}"></span></div>
              <span>${distanceText(closest.km, units)}</span>
            </div>`),
        );
      }
      const hints = h(`<div style="margin-top:12px">
          <div class="row"><span class="muted small">Stuck? Hints:</span>
            <div class="hints">${HINTS.map(
              (x) => `<button class="btn small" data-hint="${x.id}" ${this.hints.includes(x.id) ? 'disabled' : ''}>${x.label}</button>`,
            ).join('')}</div>
          </div>
          <div class="hint-out">${this.hints
            .map((id) => HINTS.find((x) => x.id === id))
            .map((x) => `<div><b>${x.label}:</b> ${esc(x.text(this.target))}</div>`)
            .join('')}</div>
        </div>`);
      play.append(hints);
      play.addEventListener('click', (e) => {
        const hb = e.target.closest('[data-hint]');
        if (hb) this.useHint(hb.dataset.hint);
        if (e.target.closest('[data-act="giveup"]')) this.giveUp();
      });
      this.panel.append(play);
      setTimeout(() => this.ac.focus(), 0);
    } else {
      const n = this.guesses.length;
      const result = h(`<div class="card">
          <h2>${this.won ? `Found it in ${n} ${n === 1 ? 'guess' : 'guesses'}${this.hints.length ? ` with ${this.hints.length} hint${this.hints.length > 1 ? 's' : ''}` : ''}` : `It was ${esc(this.target.name)}`}</h2>
          <div class="row">
            ${dailyDone ? '<span class="muted small">Come back tomorrow for a new daily country.</span>' : ''}
            <span class="spacer"></span>
            ${dailyDone ? '<button class="btn" data-act="copy">Copy result</button>' : ''}
            <button class="btn primary" data-act="next">${dailyDone ? 'Practice more' : 'Next country'}</button>
          </div>
        </div>`);
      result.addEventListener('click', (e) => {
        if (e.target.closest('[data-act="next"]')) this.newGame(true);
        if (e.target.closest('[data-act="copy"]')) this.copyResult();
      });
      this.panel.append(result);
      this.panel.append(
        factsCard(this.target, world, { units, onCountry: (c) => this.app.globe.flyToCountry(c) }),
      );
      setTimeout(() => result.querySelector('[data-act="next"]')?.focus(), 0);
    }

    if (sorted.length) {
      const list = h(`<div class="card"><h3>Guesses (closest first)</h3><ol class="guesses"></ol></div>`);
      const ol = list.querySelector('ol');
      for (const g of sorted) {
        const win = g.country.id === this.target.id;
        const neighbour = g.km === 0 && !win;
        const li = h(`<li class="guess ${win ? 'win' : ''}" title="Show on globe">
            <span class="chip" style="background:${heatColor(g.km)}"></span>
            <span class="name">${g.country.flag || ''} ${esc(g.country.name)}${neighbour ? '<span class="tag">neighbour</span>' : ''}</span>
            <span class="km">${win ? '' : distanceText(g.km, units)}</span>
            ${win ? '<span>🎯</span>' : `<span title="Head ${compassPoint(g.bearing)}">${arrow(g.bearing)}</span>`}
            <span class="pct">${g.pct}%</span>
          </li>`);
        li.addEventListener('click', () => this.app.globe.flyToCountry(g.country));
        ol.append(li);
      }
      this.panel.append(list);
    }
  }

  copyResult() {
    const rows = this.guesses.map((g) => {
      if (g.country.id === this.target.id) return '🎯';
      return g.pct > 95 ? '🟥' : g.pct > 85 ? '🟧' : g.pct > 70 ? '🟨' : '⬜';
    });
    const text = `Globe Trainer ${this.dateKey}: ${this.won ? `${this.guesses.length} guesses` : 'X'}${this.hints.length ? ` (${this.hints.length} hints)` : ''}\n${rows.join('')}`;
    navigator.clipboard?.writeText(text).then(
      () => this.app.toast('Result copied'),
      () => this.app.toast(text),
    );
  }
}
