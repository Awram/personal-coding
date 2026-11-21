// Progress: mastery per skill, weakest countries, and a mastery map on the globe.
import { MAX_BOX } from '../progress.js';
import { h, esc } from '../ui/components.js';

const SKILL_LABELS = { locate: 'Find it', name: 'Name it', hunt: 'Hunt' };
const MASTERY_COLORS = ['#ff6b6b', '#ff9f5a', '#ffd166', '#b5e07a', '#6fd38e', '#2fb872'];

export class ProgressMode {
  constructor(app) {
    this.app = app;
    this.skill = app.progress.getSetting('progressSkill', 'locate');
  }

  mount(panel) {
    this.panel = panel;
    this.app.globe.autoRotate = true;
    this.render();
  }

  onSettingsChange() {
    this.render();
  }

  updateGlobe() {
    const { progress } = this.app;
    const styles = new Map();
    for (const c of this.app.pool()) {
      const card = progress.card(this.skill, c.id);
      if (!card) continue;
      styles.set(c.id, { fill: MASTERY_COLORS[Math.min(MAX_BOX, card.box)] });
    }
    this.app.globe.setStyles(styles);
  }

  render() {
    const { progress } = this.app;
    const pool = this.app.pool();
    const hunt = progress.state.hunt;
    const streak = progress.state.streak;
    this.panel.innerHTML = '';

    const overview = h(`<div class="card">
        <h2>Your progress</h2>
        <p class="muted small" style="margin-top:0">${esc(this.app.regionLabel())} · ${pool.length} countries. Change the region in settings.</p>
        <div class="skills"></div>
      </div>`);
    const skills = overview.querySelector('.skills');
    for (const skill of ['locate', 'name', 'hunt']) {
      const s = progress.summary(skill, pool);
      const pct = (n) => (100 * n) / Math.max(1, s.total);
      skills.append(
        h(`<div style="margin-bottom:12px">
            <div class="row between"><strong>${SKILL_LABELS[skill]}</strong>
              <span class="muted small">${s.mastered} mastered · ${s.due} due</span></div>
            <div class="bar">
              <span style="width:${pct(s.mastered)}%;background:#2fb872"></span>
              <span style="width:${pct(s.learning)}%;background:#ffd166"></span>
            </div>
          </div>`),
      );
    }
    overview.append(
      h(`<div class="legend"><span><i style="background:#2fb872"></i>Mastered</span><span><i style="background:#ffd166"></i>Learning</span><span><i style="background:var(--bg-2)"></i>Not seen yet</span></div>`),
    );
    this.panel.append(overview);

    const map = h(`<div class="card">
        <div class="row between">
          <h3 style="margin:0">Mastery map</h3>
          <div class="seg" role="group" aria-label="Skill">
            ${['locate', 'name', 'hunt'].map((k) => `<button data-skill="${k}" aria-pressed="${k === this.skill}">${SKILL_LABELS[k]}</button>`).join('')}
          </div>
        </div>
        <div class="legend" style="margin-top:10px">
          ${MASTERY_COLORS.map((c, i) => `<span><i style="background:${c}"></i>${i === 0 ? 'Missed' : i === MAX_BOX ? 'Solid' : ''}</span>`).join('')}
        </div>
        <h3 style="margin-top:14px">Needs work</h3>
        <div class="weak-list"></div>
      </div>`);
    const weak = progress.weakest(this.skill, pool, 12);
    const wl = map.querySelector('.weak-list');
    wl.innerHTML = weak.length
      ? weak.map((c) => `<button class="chip-btn" data-id="${c.id}">${c.flag || ''} ${esc(c.name)}</button>`).join('')
      : '<span class="muted small">Nothing yet. Play a few rounds and your weak spots show up here.</span>';
    map.addEventListener('click', (e) => {
      const b = e.target.closest('[data-skill]');
      if (b) {
        this.skill = b.dataset.skill;
        progress.setSetting('progressSkill', this.skill);
        this.render();
        return;
      }
      const c = e.target.closest('[data-id]');
      if (c) this.app.globe.flyToCountry(this.app.world.get(c.dataset.id));
    });
    this.panel.append(map);

    const avg = hunt.won ? (hunt.guesses / hunt.won).toFixed(1) : '-';
    this.panel.append(
      h(`<div class="card">
          <h3>Hunt stats</h3>
          <div class="stats">
            <div><div class="num">${hunt.played}</div><div class="lbl">Played</div></div>
            <div><div class="num">${hunt.played ? Math.round((100 * hunt.won) / hunt.played) : 0}%</div><div class="lbl">Found</div></div>
            <div><div class="num">${avg}</div><div class="lbl">Avg guesses</div></div>
            <div><div class="num">${streak.current}</div><div class="lbl">Daily streak</div></div>
          </div>
        </div>`),
    );

    const danger = h(`<div class="card row between">
        <span class="muted small">Progress is saved in this browser only.</span>
        <button class="btn ghost small" data-act="reset">Reset progress</button>
      </div>`);
    danger.querySelector('[data-act="reset"]').addEventListener('click', () => {
      if (confirm('Delete all saved progress and stats? This cannot be undone.')) {
        const settings = progress.getSetting('app', {});
        progress.reset();
        progress.setSetting('app', settings);
        this.render();
      }
    });
    this.panel.append(danger);
    this.updateGlobe();
  }
}
