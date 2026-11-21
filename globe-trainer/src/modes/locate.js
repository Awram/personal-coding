// Find it: you're given a country name and click it on the globe.
// Misses show where you clicked and how far off you were.
import { heatColor, compassPoint } from '../geo.js';
import { h, esc, factsCard, distanceText } from '../ui/components.js';

const MAX_TRIES = 3;

export class LocateMode {
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
    this.target = progress.pickNext('locate', this.app.pool(), { avoid: this.recent });
    this.recent = [...this.recent.slice(-15), this.target.id];
    this.misses = [];
    this.done = false;
    this.success = false;
    this.feedback = { text: 'Rotate the globe and click the country.', kind: '' };
    globe.autoRotate = false;
    // Zoom out a bit so the answer isn't right under the cursor.
    if (globe.zoom > 1.6) globe.flyTo(globe._viewCenter(), 1.2, 600);
    this.render();
    this.updateGlobe();
  }

  onPick(c) {
    if (this.done) {
      if (c) this.app.toast(`${c.flag || ''} ${c.name}`);
      return;
    }
    if (!c) return;
    if (c.id === 'ATA') return this.app.toast('That is Antarctica.');
    const { world, settings } = this.app;
    if (c.id === this.target.id) {
      this.done = true;
      this.success = true;
      const quality = this.misses.length === 0 ? 2 : 1;
      this.app.progress.record('locate', this.target.id, quality);
      this.bump(quality === 2);
      this.feedback = { text: this.misses.length ? `Got it on try ${this.misses.length + 1}.` : 'Spot on, first try!', kind: 'good' };
    } else {
      if (this.misses.some((m) => m.country.id === c.id)) return;
      const km = world.distance(c, this.target);
      const dir = compassPoint(world.bearing(c, this.target));
      this.misses.push({ country: c, km });
      const where = km === 0 ? `It borders ${c.name}` : `It's ${distanceText(km, settings.units)} ${dir} of there`;
      this.feedback = { text: `That's ${c.name}. ${where}.`, kind: 'bad' };
      if (this.misses.length >= MAX_TRIES) {
        this.done = true;
        this.app.progress.record('locate', this.target.id, 0);
        this.bump(false);
        this.feedback = { text: `That's ${c.name}. Here's ${this.target.name}.`, kind: 'bad' };
        this.app.globe.flyToCountry(this.target);
      }
    }
    this.render();
    this.updateGlobe();
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

  skip() {
    if (this.done) return this.next();
    this.app.progress.record('locate', this.target.id, 0);
    this.bump(false);
    this.done = true;
    this.feedback = { text: `Here's ${this.target.name}.`, kind: '' };
    this.app.globe.flyToCountry(this.target);
    this.render();
    this.updateGlobe();
  }

  updateGlobe() {
    const styles = new Map();
    for (const m of this.misses) {
      styles.set(m.country.id, { fill: heatColor(m.km), label: m.country.name });
    }
    if (this.done) {
      styles.set(this.target.id, {
        fill: this.success ? '#4fd18b' : '#ffc94a',
        stroke: '#fff',
        strokeWidth: 1.5,
        label: this.target.name,
        pulse: true,
      });
    }
    this.app.globe.setStyles(styles);
  }

  render() {
    const { progress, world, settings } = this.app;
    const t = this.target;
    const card = progress.card('locate', t.id);
    const s = this.session;
    const showRegion = this.misses.length >= 1;
    this.panel.innerHTML = '';
    const main = h(`
      <div class="card">
        <div class="row between">
          <span class="muted small">Find it · ${esc(this.app.regionLabel())}</span>
          <span class="attempts" title="Tries left">${Array.from({ length: MAX_TRIES }, (_, i) => `<span class="${i < this.misses.length ? 'used' : ''}"></span>`).join('')}</span>
        </div>
        <div class="prompt">${esc(t.name)}</div>
        <div class="muted small">${showRegion || this.done ? `${esc(t.subregion || t.region)}` : '&nbsp;'}${card ? ` · seen ${card.seen}×` : ' · new'}</div>
        <p class="feedback ${this.feedback.kind}">${esc(this.feedback.text)}</p>
        <div class="row">
          <span class="muted small">Session: ${s.firstTry}/${s.asked} first try · streak ${s.streak}</span>
          <span class="spacer"></span>
          ${this.done ? '<button class="btn primary" data-act="next">Next <kbd>Enter</kbd></button>' : '<button class="btn ghost small" data-act="skip">Show me</button>'}
        </div>
      </div>`);
    main.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="next"]')) this.next();
      if (e.target.closest('[data-act="skip"]')) this.skip();
    });
    this.panel.append(main);
    if (this.done) {
      this.panel.append(factsCard(t, world, { units: settings.units, onCountry: (c) => this.app.globe.flyToCountry(c) }));
    } else {
      this.panel.append(
        h(`<div class="card muted small">Drag to spin, scroll or pinch to zoom. Small countries have a dot you can click.
            Countries you miss come back sooner; ones you nail get spaced further apart.</div>`),
      );
    }
  }
}
