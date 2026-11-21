// Daily Hunt: guess the mystery country. Each guess is coloured by how close it is,
// with distance, compass direction and a proximity score. Once found, a short quiz
// on its capital, population, language and currency.
import { heatColor, proximity, compassPoint } from '../geo.js';
import { dailyPick, todayKey } from '../progress.js';
import { buildQuiz, QUIZ_LABELS } from '../quiz.js';
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
  }

  mount(panel) {
    this.panel = panel;
    this.startDaily();
  }

  unmount() {
    this.ac?.destroy();
  }

  onSettingsChange() {
    this.render();
    this.updateGlobe();
  }

  reset() {
    this.guesses = [];
    this.hints = [];
    this.done = false;
    this.won = false;
    this.quiz = null; // { questions, answers: [index chosen], finished }
  }

  startDaily() {
    const { progress, world } = this.app;
    this.reset();
    this.practice = false;
    this.dateKey = todayKey();
    this.target = dailyPick(world.pool({ region: 'world' }), this.dateKey);
    const saved = progress.getDaily(this.dateKey);
    if (saved && saved.id === this.target.id) {
      this.guesses = saved.list.map((id) => this.scoreGuess(world.get(id))).filter(Boolean);
      this.hints = saved.hints || [];
      this.done = saved.done;
      this.won = saved.won;
      this.quiz = saved.quiz || null;
    }
    if (this.won && !this.quiz) this.quiz = this.newQuiz();
    this.begin();
  }

  startPractice() {
    this.reset();
    this.practice = true;
    this.target = this.app.progress.pickNext('hunt', this.app.pool(), { avoid: this.recent || [] });
    this.recent = [...(this.recent || []).slice(-10), this.target.id];
    this.begin();
  }

  begin() {
    this.app.globe.autoRotate = !this.guesses.length;
    this.render();
    this.updateGlobe();
    if (this.done) this.app.globe.flyToCountry(this.target);
  }

  newQuiz() {
    const pool = this.app.world.pool({ includeTerritories: true });
    return { questions: buildQuiz(this.target, pool), answers: [], finished: false };
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
    if (!this.done) {
      this.app.globe.flyToCountry(c);
      const msg = g.km === 0 ? `${c.name} borders it!` : `${c.name}: ${distanceText(g.km, this.app.settings.units)} away, head ${compassPoint(g.bearing)}`;
      this.app.toast(msg);
    }
  }

  finish(won) {
    this.done = true;
    this.won = won;
    if (won) this.quiz = this.newQuiz();
    this.app.progress.recordHunt(this.target.id, this.guesses.length, won, this.hints.length);
    this.app.globe.flyToCountry(this.target);
  }

  persist() {
    if (this.practice) return;
    this.app.progress.setDaily(this.dateKey, {
      id: this.target.id,
      list: this.guesses.map((g) => g.country.id),
      hints: this.hints,
      done: this.done,
      won: this.won,
      quiz: this.quiz,
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
    if (!confirm('Give up and reveal the country?')) return;
    this.finish(false);
    this.persist();
    this.render();
    this.updateGlobe();
  }

  answerQuiz(i) {
    const q = this.quiz;
    const n = q.answers.length;
    if (q.finished || n >= q.questions.length) return;
    const question = q.questions[n];
    const chosen = question.options[i];
    q.answers.push(chosen);
    this.app.progress.recordQuiz(question.type, chosen === question.answer);
    this.persist();
    this.render();
  }

  nextQuestion() {
    const q = this.quiz;
    if (q.answers.length >= q.questions.length) {
      q.finished = true;
      const right = q.answers.filter((a, i) => a === q.questions[i].answer).length;
      this.app.progress.record('facts', this.target.id, right === q.questions.length ? 2 : right >= q.questions.length / 2 ? 1 : 0);
      this.persist();
    }
    this.render();
  }

  quizScore() {
    if (!this.quiz) return null;
    const { questions, answers } = this.quiz;
    return { right: answers.filter((a, i) => a === questions[i].answer).length, total: questions.length };
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
    this.ac?.destroy();
    this.ac = null;
    this.panel.innerHTML = '';
    const q = this.quiz;
    // Reloaded after the last answer but before "See results": finish the quiz.
    if (q && !q.finished && q.answers.length >= q.questions.length && this._awaitingNext !== q.answers.length) {
      this.nextQuestion();
      return;
    }
    if (!this.done) this.renderGuessing();
    else if (this.won && this.quiz && !this.quiz.finished && this.quiz.questions.length) this.renderQuiz();
    else this.renderDone();
    this.renderGuessList();
  }

  renderGuessing() {
    const units = this.app.settings.units;
    const sorted = [...this.guesses].sort((a, b) => a.km - b.km);
    const closest = sorted[0];
    const play = h(`<div class="card">
        <div class="row between" style="margin-bottom:8px">
          <strong>${this.practice ? 'Practice' : 'Daily'} · guess ${this.guesses.length + 1}</strong>
          <button class="btn ghost small" data-act="giveup">Give up</button>
        </div>
        ${
          this.guesses.length
            ? ''
            : `<p class="muted small" style="margin:0 0 10px">Find the mystery country. Each guess shows how far it is from the target, which way to head, and gets hotter the closer you are.</p>`
        }
      </div>`);
    this.ac = autocomplete({
      index: this.app.index,
      exclude: this.guesses.map((g) => g.country.id),
      onSubmit: (c, raw) => this.guess(c, raw),
    });
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
    play.append(
      h(`<div style="margin-top:12px">
          <div class="row"><span class="muted small">Stuck? Hints:</span>
            <div class="hints">${HINTS.map(
              (x) => `<button class="btn small" data-hint="${x.id}" ${this.hints.includes(x.id) ? 'disabled' : ''}>${x.label}</button>`,
            ).join('')}</div>
          </div>
          <div class="hint-out">${this.hints
            .map((id) => HINTS.find((x) => x.id === id))
            .map((x) => `<div><b>${x.label}:</b> ${esc(x.text(this.target))}</div>`)
            .join('')}</div>
        </div>`),
    );
    play.addEventListener('click', (e) => {
      const hb = e.target.closest('[data-hint]');
      if (hb) this.useHint(hb.dataset.hint);
      if (e.target.closest('[data-act="giveup"]')) this.giveUp();
    });
    this.panel.append(play);
    setTimeout(() => this.ac?.autofocus(), 0);
  }

  renderQuiz() {
    const t = this.target;
    const { questions, answers } = this.quiz;
    const n = answers.length;
    // Show the last answered question with feedback until "Next" is pressed.
    const showingFeedback = this._awaitingNext === n && n > 0;
    const idx = showingFeedback ? n - 1 : n;
    const q = questions[idx];
    const g = this.guesses.length;

    const card = h(`<div class="card quiz">
        <div class="row between">
          <span class="badge">🎯 Found ${esc(t.name)} in ${g} ${g === 1 ? 'guess' : 'guesses'}</span>
          <span class="muted small">${idx + 1} of ${questions.length}</span>
        </div>
        <div class="quiz-steps">${questions
          .map((qq, i) => {
            const state = i < answers.length ? (answers[i] === qq.answer ? 'right' : 'wrong') : i === idx ? 'current' : '';
            return `<span class="step ${state}">${QUIZ_LABELS[qq.type]}</span>`;
          })
          .join('')}</div>
        <div class="quiz-q">${esc(q.prompt)}</div>
        <div class="choices"></div>
        <div class="quiz-feedback"></div>
      </div>`);
    const grid = card.querySelector('.choices');
    const chosen = showingFeedback ? answers[idx] : null;
    for (const [i, opt] of q.options.entries()) {
      let cls = '';
      if (showingFeedback) {
        if (opt === q.answer) cls = 'right';
        else if (opt === chosen) cls = 'wrong';
      }
      const b = h(`<button class="btn ${cls}" ${showingFeedback ? 'disabled' : ''}>${esc(opt)}</button>`);
      b.addEventListener('click', () => {
        this._awaitingNext = n + 1;
        this.answerQuiz(i);
      });
      grid.append(b);
    }
    if (showingFeedback) {
      const right = chosen === q.answer;
      const more = q.all && q.all.length > 1 ? ` (${q.all.join(', ')})` : '';
      const fb = h(`<div>
          <p class="feedback ${right ? 'good' : 'bad'}">${right ? 'Correct!' : `It's ${esc(q.answer)}.`}${esc(more)}${q.note ? ` <span class="muted small">${esc(q.note)}</span>` : ''}</p>
          <div class="row end"><button class="btn primary" data-act="next">${idx + 1 === questions.length ? 'See results' : 'Next question'}</button></div>
        </div>`);
      fb.querySelector('[data-act="next"]').addEventListener('click', () => {
        this._awaitingNext = null;
        this.nextQuestion();
      });
      card.querySelector('.quiz-feedback').append(fb);
      setTimeout(() => card.querySelector('[data-act="next"]')?.focus(), 0);
    }
    this.panel.append(card);
  }

  renderDone() {
    const { settings, progress, world } = this.app;
    const n = this.guesses.length;
    const score = this.won ? this.quizScore() : null;
    const streak = progress.state.streak;
    const daily = !this.practice;
    const result = h(`<div class="card">
        <h2>${
          this.won
            ? `Found it in ${n} ${n === 1 ? 'guess' : 'guesses'}${this.hints.length ? ` with ${this.hints.length} hint${this.hints.length > 1 ? 's' : ''}` : ''}`
            : `It was ${esc(this.target.name)}`
        }</h2>
        ${score && score.total ? `<p style="margin:0 0 8px">Fact quiz: <strong>${score.right}/${score.total}</strong></p>` : ''}
        ${daily ? `<p class="muted small" style="margin:0 0 10px">Daily streak ${streak.current} · best ${streak.best}. A new country arrives tomorrow.</p>` : ''}
        <div class="row">
          <span class="spacer"></span>
          ${daily ? '<button class="btn" data-act="copy">Copy result</button>' : '<button class="btn" data-act="daily">Back to daily</button>'}
          <button class="btn primary" data-act="practice">${daily ? 'Practice round' : 'Another one'}</button>
        </div>
      </div>`);
    result.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="practice"]')) this.startPractice();
      if (e.target.closest('[data-act="daily"]')) this.startDaily();
      if (e.target.closest('[data-act="copy"]')) this.copyResult();
    });
    this.panel.append(result);
    this.panel.append(factsCard(this.target, world, { units: settings.units, onCountry: (c) => this.app.globe.flyToCountry(c) }));
  }

  renderGuessList() {
    const units = this.app.settings.units;
    const sorted = [...this.guesses].sort((a, b) => a.km - b.km);
    if (!sorted.length) return;
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

  copyResult() {
    const rows = this.guesses.map((g) => {
      if (g.country.id === this.target.id) return '🎯';
      return g.pct > 95 ? '🟥' : g.pct > 85 ? '🟧' : g.pct > 70 ? '🟨' : '⬜';
    });
    const score = this.won ? this.quizScore() : null;
    const quizLine = score && score.total ? `\nFacts ${score.right}/${score.total} ${this.quiz.answers.map((a, i) => (a === this.quiz.questions[i].answer ? '✅' : '❌')).join('')}` : '';
    const text = `Globe Trainer ${this.dateKey}: ${this.won ? `${this.guesses.length} guesses` : 'X'}${this.hints.length ? ` (${this.hints.length} hints)` : ''}\n${rows.join('')}${quizLine}`;
    navigator.clipboard?.writeText(text).then(
      () => this.app.toast('Result copied'),
      () => this.app.toast(text),
    );
  }
}
