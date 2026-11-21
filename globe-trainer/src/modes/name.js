// Name it: the globe highlights a country and you name it.
// Typed answers by default, or multiple choice from nearby countries.
import { h, esc, autocomplete, factsCard } from '../ui/components.js';

const MAX_TRIES = 3;

export class NameMode {
  constructor(app) {
    this.app = app;
    this.session = { asked: 0, firstTry: 0, streak: 0 };
    this.recent = [];
  }

  mount(panel) {
    this.panel = panel;
    this.onKey = (e) => {
      if (e.key === 'Enter' && this.done && !e.target.closest('input, select, textarea, dialog')) this.next();
    };
    document.addEventListener('keydown', this.onKey);
    this.next();
  }

  unmount() {
    document.removeEventListener('keydown', this.onKey);
  }

  onSettingsChange() {
    this.next();
  }

  next() {
    const { progress, globe } = this.app;
    this.target = progress.pickNext('name', this.app.pool(), { avoid: this.recent });
    this.recent = [...this.recent.slice(-15), this.target.id];
    this.wrong = [];
    this.done = false;
    this.success = false;
    this.showNeighbours = false;
    this.choices = this.app.settings.choices ? this.makeChoices() : null;
    this.feedback = { text: '', kind: '' };
    globe.flyToCountry(this.target);
    this.render();
    this.updateGlobe();
  }

  /** Four options: the answer plus three of the nearest countries, so it stays a real test. */
  makeChoices() {
    const { world } = this.app;
    const t = this.target;
    const others = world
      .pool({ includeTerritories: this.app.settings.territories })
      .filter((c) => c.id !== t.id)
      .map((c) => ({ c, d: Math.acos(Math.min(1, c.centerVec[0] * t.centerVec[0] + c.centerVec[1] * t.centerVec[1] + c.centerVec[2] * t.centerVec[2])) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 8)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map((x) => x.c);
    return [t, ...others].sort(() => Math.random() - 0.5);
  }

  answer(c, raw) {
    if (this.done) return;
    if (!c) return this.app.toast(`Couldn't find “${raw}”.`);
    if (c.id === this.target.id) {
      this.done = true;
      this.success = true;
      const quality = this.wrong.length === 0 && !this.showNeighbours ? 2 : 1;
      this.app.progress.record('name', this.target.id, quality);
      this.bump(quality === 2);
      this.feedback = { text: this.wrong.length ? `Yes, on try ${this.wrong.length + 1}.` : 'Correct!', kind: 'good' };
    } else {
      if (this.wrong.some((w) => w.id === c.id)) return;
      this.wrong.push(c);
      this.feedback = { text: `Not ${c.name}. ${c.name} is shown in red.`, kind: 'bad' };
      if (this.wrong.length >= MAX_TRIES) this.reveal(false);
    }
    this.render();
    this.updateGlobe();
  }

  reveal(skipped = true) {
    this.done = true;
    this.app.progress.record('name', this.target.id, 0);
    this.bump(false);
    this.feedback = { text: `It's ${this.target.name}.`, kind: skipped ? '' : 'bad' };
    this.app.globe.flyToCountry(this.target);
  }

  bump(firstTry) {
    this.session.asked += 1;
    if (firstTry) {
      this.session.firstTry += 1;
      this.session.streak += 1;
    } else {
      this.session.streak = 0;
    }
  }

  onPick(c) {
    if (c) this.app.toast(this.done || c.id !== this.target.id ? `${c.flag || ''} ${c.name}` : 'Nice try, type the name.');
  }

  updateGlobe() {
    const { world } = this.app;
    const t = this.target;
    const styles = new Map();
    if (this.showNeighbours || this.done) {
      for (const id of t.borders) {
        const n = world.get(id);
        if (n) styles.set(id, { fill: '#9fb4d6', label: n.name });
      }
    }
    for (const w of this.wrong) styles.set(w.id, { fill: '#ff6b6b', label: w.name });
    styles.set(t.id, {
      fill: this.done ? (this.success ? '#4fd18b' : '#ffc94a') : '#ffc94a',
      stroke: '#fff',
      strokeWidth: 1.5,
      label: this.done ? t.name : null,
      pulse: true,
    });
    this.app.globe.setStyles(styles);
  }

  render() {
    const { progress, world, settings } = this.app;
    const t = this.target;
    const card = progress.card('name', t.id);
    const s = this.session;
    this.panel.innerHTML = '';
    const main = h(`
      <div class="card">
        <div class="row between">
          <span class="muted small">Name it · ${esc(this.app.regionLabel())}</span>
          <span class="attempts" title="Tries left">${Array.from({ length: MAX_TRIES }, (_, i) => `<span class="${i < this.wrong.length ? 'used' : ''}"></span>`).join('')}</span>
        </div>
        <div class="prompt">${this.done ? `<span class="flag">${t.flag || ''}</span>${esc(t.name)}` : 'Which country is highlighted?'}</div>
        <div class="muted small">${card ? `Seen ${card.seen}×` : 'New country'}${t.tiny ? ' · small, look for the pulsing ring' : ''}</div>
        <div class="slot" style="margin-top:10px"></div>
        <p class="feedback ${this.feedback.kind}">${esc(this.feedback.text)}</p>
        <div class="row">
          <span class="muted small">Session: ${s.firstTry}/${s.asked} first try · streak ${s.streak}</span>
          <span class="spacer"></span>
          ${
            this.done
              ? '<button class="btn primary" data-act="next">Next <kbd>Enter</kbd></button>'
              : `<button class="btn ghost small" data-act="neighbours" ${this.showNeighbours || !t.borders.length ? 'disabled' : ''}>Show neighbours</button>
                 <button class="btn ghost small" data-act="reveal">Show me</button>`
          }
        </div>
      </div>`);
    const slot = main.querySelector('.slot');
    if (!this.done) {
      if (this.choices) {
        const grid = h(`<div class="choices">${this.choices
          .map((c) => `<button class="btn ${this.wrong.some((w) => w.id === c.id) ? 'wrong' : ''}" data-id="${c.id}" ${this.wrong.some((w) => w.id === c.id) ? 'disabled' : ''}>${esc(c.name)}</button>`)
          .join('')}</div>`);
        grid.addEventListener('click', (e) => {
          const b = e.target.closest('[data-id]');
          if (b) this.answer(world.get(b.dataset.id));
        });
        slot.append(grid);
      } else {
        this.ac = autocomplete({ index: this.app.index, placeholder: 'Name this country…', onSubmit: (c, raw) => this.answer(c, raw) });
        slot.append(this.ac.el);
        setTimeout(() => this.ac.focus(), 0);
      }
    } else {
      slot.remove();
      setTimeout(() => main.querySelector('[data-act="next"]')?.focus(), 0);
    }
    main.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="next"]')) this.next();
      if (e.target.closest('[data-act="reveal"]')) {
        this.reveal(true);
        this.render();
        this.updateGlobe();
      }
      if (e.target.closest('[data-act="neighbours"]')) {
        this.showNeighbours = true;
        this.render();
        this.updateGlobe();
      }
    });
    this.panel.append(main);
    if (this.done) {
      this.panel.append(factsCard(t, world, { units: settings.units, onCountry: (c) => this.app.globe.flyToCountry(c) }));
    }
  }
}
