// Stats dialog: mastery per skill, weakest countries, Daily Hunt and quiz stats.
import { h, esc } from './ui/components.js';
import { QUIZ_LABELS } from './quiz.js';

const SKILL_LABELS = { hunt: 'Daily Hunt', locate: 'Finder', name: 'Name', facts: 'Fact quiz' };

/** Render stats into `root`. `onCountry` is called when a weak country is tapped. */
export function renderStats(app, root, { onCountry, skill = 'locate', onSkill } = {}) {
  const { progress } = app;
  const pool = app.pool();
  const streak = progress.state.streak;
  root.innerHTML = '';

  const d = progress.dailyStats();
  const dist = [...Array(10).keys()].map((i) => i + 1);
  const maxCount = Math.max(1, ...d.distribution.values());
  root.append(
    h(`<section>
        <h3>Daily Hunt</h3>
        <div class="stats">
          <div><div class="num">${d.played}</div><div class="lbl">Played</div></div>
          <div><div class="num">${d.best ?? '-'}</div><div class="lbl">Best score</div></div>
          <div><div class="num">${progress.currentStreak()}</div><div class="lbl">Streak</div></div>
          <div><div class="num">${streak.best}</div><div class="lbl">Best streak</div></div>
        </div>
        <p class="muted small">Score = guesses + 2 per hint, lower is better. Found ${d.won} of ${d.played}${d.average ? `, average ${d.average.toFixed(1)}` : ''}, ${d.unassisted} without hints. Your streak grows each day you find the country; giving up or missing a day resets it.</p>
        ${
          d.won
            ? `<div class="dist">${dist
                .map((sc) => {
                  const c = d.distribution.get(sc) || 0;
                  return `<div class="dist-row"><span class="muted">${sc === 10 ? '10+' : sc}</span>
                    <span><span class="fill ${sc === Math.min(d.best, 10) ? 'best' : ''}" style="display:inline-block;width:${Math.max(6, (100 * c) / maxCount)}%">${c}</span></span></div>`;
                })
                .join('')}</div>`
            : ''
        }
      </section>`),
  );

  const quiz = progress.state.quiz || {};
  const quizRows = Object.keys(QUIZ_LABELS)
    .map((k) => {
      const q = quiz[k];
      const pct = q?.asked ? Math.round((100 * q.correct) / q.asked) : null;
      return `<div class="row between small"><span>${QUIZ_LABELS[k]}</span>
        <span class="muted">${q?.asked ? `${q.correct}/${q.asked} · ${pct}%` : 'not asked yet'}</span></div>
        <div class="bar"><span style="width:${pct ?? 0}%;background:#4fd18b"></span></div>`;
    })
    .join('');
  root.append(h(`<section><h3>Fact quiz</h3>${quizRows}</section>`));

  const mastery = h(`<section>
      <h3>Countries learned</h3>
      <p class="muted small" style="margin:0 0 8px">${esc(app.regionLabel())} · ${pool.length} countries (change in settings)</p>
      <div class="skills"></div>
      <div class="legend"><span><i style="background:#2fb872"></i>Mastered</span><span><i style="background:#ffd166"></i>Learning</span><span><i style="background:var(--bg-2)"></i>Not seen</span></div>
    </section>`);
  const skills = mastery.querySelector('.skills');
  for (const k of ['locate', 'name']) {
    const s = progress.summary(k, pool);
    const pct = (n) => (100 * n) / Math.max(1, s.total);
    skills.append(
      h(`<div style="margin-bottom:10px">
          <div class="row between small"><strong>${SKILL_LABELS[k]}</strong>
            <span class="muted">${s.mastered} mastered · ${s.learning} learning · ${s.due} due</span></div>
          <div class="bar">
            <span style="width:${pct(s.mastered)}%;background:#2fb872"></span>
            <span style="width:${pct(s.learning)}%;background:#ffd166"></span>
          </div>
        </div>`),
    );
  }
  root.append(mastery);

  const weakSec = h(`<section>
      <div class="row between">
        <h3 style="margin:0">Needs work</h3>
        <div class="seg" role="group" aria-label="Skill">
          ${['locate', 'name'].map((k) => `<button type="button" data-skill="${k}" aria-pressed="${k === skill}">${SKILL_LABELS[k]}</button>`).join('')}
        </div>
      </div>
      <div class="weak-list" style="margin-top:10px"></div>
    </section>`);
  const weak = progress.weakest(skill, pool, 12);
  weakSec.querySelector('.weak-list').innerHTML = weak.length
    ? weak.map((c) => `<button type="button" class="chip-btn" data-id="${c.id}">${c.flag || ''} ${esc(c.name)}</button>`).join('')
    : '<span class="muted small">Nothing yet. Play a few rounds and your weak spots show up here.</span>';
  weakSec.addEventListener('click', (e) => {
    const b = e.target.closest('[data-skill]');
    if (b) return onSkill?.(b.dataset.skill);
    const c = e.target.closest('[data-id]');
    if (c) onCountry?.(app.world.get(c.dataset.id));
  });
  root.append(weakSec);

  const danger = h(`<section class="row between">
      <span class="muted small">Progress is saved on this device only.</span>
      <button type="button" class="btn ghost small" data-act="reset">Reset progress</button>
    </section>`);
  danger.querySelector('[data-act="reset"]').addEventListener('click', () => {
    if (!confirm('Delete all saved progress and stats? This cannot be undone.')) return;
    const settings = progress.getSetting('app', {});
    progress.reset();
    progress.setSetting('app', settings);
    renderStats(app, root, { onCountry, skill, onSkill });
  });
  root.append(danger);
}
