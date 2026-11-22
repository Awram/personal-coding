// Daily Hunt: one mystery country a day. Each guess is coloured by how close it is,
// with distance, compass direction and a proximity score. Score = guesses plus a
// penalty per hint (lower is better). Once found, a short quiz on its capital,
// population, language and currency.
import { heatColor, proximity, compassPoint } from '../geo.js';
import { dailyPick, todayKey, huntScore, HINT_COST } from '../progress.js';
import { buildQuiz, QUIZ_LABELS } from '../quiz.js';
import { h, esc, autocomplete, arrow, factsCard, distanceText } from '../ui/components.js';

const HINTS = [
  { id: 'region', label: 'Region', text: (t) => `It's in ${t.subregion || t.region}.` },
  { id: 'size', label: 'Size', text: (t) => `It covers about ${roundArea(t.area)} km²${t.landlocked ? ' and is landlocked' : ''}.` },
  { id: 'letter', label: 'First letter', text: (t) => `The name starts with “${t.name[0]}”.` },
];

function roundArea(a) {
  if (a > 1e6) return `${(a / 1e6).toFixed(1)} million`;
  if (a > 1e4) return `${Math.round(a / 1000).toLocaleString()},000`;
  return Math.round(a).toLocaleString();
}

function untilMidnight() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const mins = Math.max(1, Math.round((next - now) / 60000));
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
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
    clearInterval(this.timer);
  }

  onSettingsChange() {
    this.render();
    this.updateGlobe();
  }

  startDaily() {
    const { progress, world } = this.app;
    this.guesses = [];
    this.hints = [];
    this.done = false;
    this.won = false;
    this.quiz = null; // { questions, answers: [chosen option], finished }
    this.dateKey = todayKey();
    this.target = dailyPick(world.pool({ region: 'world' }), this.dateKey);
    const saved = progress.getDaily(this.dateKey);
    if (saved && saved.id === this.target.id) {
      this.guesses = saved.list.map((id) => this.scoreGuess(world.get(id))).filter(Boolean);
      this.hints = (saved.hints || []).filter((id) => HINTS.some((x) => x.id === id));
      this.done = saved.done;
      this.won = saved.won;
      this.quiz = saved.quiz || null;
    }
    if (this.won && !this.quiz) this.quiz = this.newQuiz();
    this.app.globe.autoRotate = !this.guesses.length;
    this.render();
    this.updateGlobe();
    if (this.done) this.app.globe.flyToCountry(this.target);
  }

  newQuiz() {
    const pool = this.app.world.pool({ includeTerritories: true });
    return { questions: buildQuiz(this.target, pool), answers: [], finished: false };
  }

  get score() {
    return huntScore(this.guesses.length, this.hints.length);
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
  }

  finish(won) {
    this.done = true;
    this.won = won;
    if (won) this.quiz = this.newQuiz();
    this.app.progress.recordHunt(this.target.id, this.guesses.length, won, this.hints.length);
    this.app.globe.flyToCountry(this.target);
  }

  persist() {
    const wasUnlocked = this.app.progress.isUnlocked();
    this.app.progress.setDaily(this.dateKey, {
      id: this.target.id,
      list: this.guesses.map((g) => g.country.id),
      hints: this.hints,
      done: this.done,
      won: this.won,
      score: this.won ? this.score : null,
      quiz: this.quiz,
    });
    if (!wasUnlocked && this.app.progress.isUnlocked()) {
      this.unlockedNow = true;
      this.app.refreshLocks();
    }
  }

  useHint(id) {
    if (this.hints.includes(id) || this.done) return;
    this.hints.push(id);
    this.persist();
    this.render();
  }

  giveUp() {
    if (this.done) return;
    const streak = this.app.progress.currentStreak(this.dateKey);
    const warn = streak ? `\n\nThis ends your ${streak}-day streak.` : '';
    if (!confirm(`Give up and reveal today's country?${warn}`)) return;
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
    clearInterval(this.timer);
    this.panel.innerHTML = '';
    const q = this.quiz;
    // Reloaded after the last answer but before "See results": finish the quiz.
    if (q && !q.finished && q.answers.length >= q.questions.length && this._awaitingNext !== q.answers.length) {
      this.nextQuestion();
      return;
    }
    if (!this.done) return this.renderGuessing();
    if (this.won && q && !q.finished && q.questions.length) this.renderQuiz();
    else this.renderDone();
    this.panel.append(this.guessList({ collapsed: true }));
  }

  /** Guesses sorted closest first. The latest one is marked so you can spot it. */
  guessList({ collapsed = false } = {}) {
    const units = this.app.settings.units;
    const latest = this.guesses[this.guesses.length - 1];
    const sorted = [...this.guesses].sort((a, b) => a.km - b.km);
    const ol = h('<ol class="guesses"></ol>');
    for (const g of sorted) {
      const win = g.country.id === this.target.id;
      const neighbour = g.km === 0 && !win;
      const isLatest = g === latest && !win && this.guesses.length > 1;
      const li = h(`<li class="guess ${win ? 'win' : ''} ${isLatest ? 'latest' : ''}" title="${isLatest ? 'Latest guess. ' : ''}Show on globe">
          <span class="chip" style="background:${heatColor(g.km)}"></span>
          <span class="name">${g.country.flag || ''} ${esc(g.country.name)}${neighbour ? '<span class="tag">borders</span>' : ''}</span>
          <span class="km">${win ? '' : distanceText(g.km, units)}</span>
          ${win ? '<span>🎯</span>' : `<span title="Head ${compassPoint(g.bearing)}">${arrow(g.bearing)}</span>`}
          <span class="pct">${g.pct}%</span>
        </li>`);
      li.addEventListener('click', () => this.app.globe.flyToCountry(g.country));
      ol.append(li);
    }
    if (!collapsed) return ol;
    const d = h(`<details class="card guess-details"><summary>Your guesses (${this.guesses.length})</summary></details>`);
    d.append(ol);
    return d;
  }

  renderGuessing() {
    const n = this.guesses.length;
    const play = h(`<div class="card">
        <div class="row between" style="margin-bottom:8px">
          <strong>Daily Hunt · guess ${n + 1}</strong>
          ${this.hints.length ? `<span class="muted small">Score so far ${this.score}</span>` : ''}
        </div>
        ${
          n
            ? ''
            : `<p class="muted small" style="margin:0 0 10px">Find today's mystery country in as few guesses as you can. Each guess shows how far away it is and which way to head, and gets hotter the closer you are.</p>`
        }
      </div>`);
    this.ac = autocomplete({
      index: this.app.index,
      exclude: this.guesses.map((g) => g.country.id),
      onSubmit: (c, raw) => this.guess(c, raw),
    });
    play.append(this.ac.el);
    if (n) {
      const list = this.guessList();
      list.style.marginTop = '10px';
      play.append(list);
    }
    const foot = h(`<div class="hunt-foot">
        <div class="row">
          <span class="muted small">Hints (+${HINT_COST} each):</span>
          <div class="hints">${HINTS.map(
            (x) => `<button class="btn small" data-hint="${x.id}" ${this.hints.includes(x.id) ? 'disabled' : ''}>${x.label}</button>`,
          ).join('')}</div>
        </div>
        <div class="hint-out">${this.hints
          .map((id) => HINTS.find((x) => x.id === id))
          .map((x) => `<div><b>${x.label}:</b> ${esc(x.text(this.target))}</div>`)
          .join('')}</div>
        ${n ? '<div class="row end"><button class="btn ghost small" data-act="giveup">Give up</button></div>' : ''}
      </div>`);
    foot.addEventListener('click', (e) => {
      const hb = e.target.closest('[data-hint]');
      if (hb) this.useHint(hb.dataset.hint);
      if (e.target.closest('[data-act="giveup"]')) this.giveUp();
    });
    play.append(foot);
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

    const card = h(`<div class="card quiz">
        <div class="row between">
          <span class="badge">🎯 Found ${esc(t.name)} · score ${this.score}</span>
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
    const quiz = this.won ? this.quizScore() : null;
    const streak = progress.currentStreak(this.dateKey);
    const stats = progress.dailyStats();
    const isBest = this.won && stats.best === this.score && stats.won > 1;
    const breakdown = this.hints.length
      ? `${n} ${n === 1 ? 'guess' : 'guesses'} + ${this.hints.length} hint${this.hints.length > 1 ? 's' : ''} × ${HINT_COST}`
      : `${n} ${n === 1 ? 'guess' : 'guesses'}, no hints`;
    const result = h(`<div class="card result">
        ${
          this.won
            ? `<div class="score-row">
                <div class="big-score">${this.score}</div>
                <div><div class="score-title">${isBest ? 'New best score!' : 'Today’s score'}</div>
                  <div class="muted small">${breakdown}. Lower is better.</div></div>
              </div>`
            : `<h2>It was ${esc(this.target.name)}</h2>`
        }
        <div class="mini-stats">
          <div><b>${streak}</b><span>Streak</span></div>
          <div><b>${progress.state.streak.best}</b><span>Best streak</span></div>
          <div><b>${stats.best ?? '-'}</b><span>Best score</span></div>
          ${quiz && quiz.total ? `<div><b>${quiz.right}/${quiz.total}</b><span>Fact quiz</span></div>` : ''}
        </div>
        <p class="muted small" style="margin:10px 0">Next country in <span data-countdown>${untilMidnight()}</span>.</p>
        <div class="row end"><button class="btn" data-act="copy">Copy result</button></div>
      </div>`);
    result.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="copy"]')) this.copyResult();
    });
    this.panel.append(result);
    this.timer = setInterval(() => {
      const el = result.querySelector('[data-countdown]');
      if (el) el.textContent = untilMidnight();
      if (todayKey() !== this.dateKey) this.startDaily();
    }, 30000);

    if (this.unlockedNow) {
      this.unlockedNow = false;
      const u = h(`<div class="card unlock">
          <h2>New modes unlocked</h2>
          <p class="muted small" style="margin:0 0 10px">Practise any time while you wait for tomorrow's country.</p>
          <div class="row">
            <button class="btn primary" data-go="locate">Finder: tap the country</button>
            <button class="btn primary" data-go="name">Name: name the country</button>
          </div>
        </div>`);
      u.addEventListener('click', (e) => {
        const b = e.target.closest('[data-go]');
        if (b) this.app.switchMode(b.dataset.go);
      });
      this.panel.append(u);
    }
    this.panel.append(factsCard(this.target, world, { units: settings.units, onCountry: (c) => this.app.globe.flyToCountry(c) }));
  }

  copyResult() {
    const rows = this.guesses.map((g) => {
      if (g.country.id === this.target.id) return '🎯';
      return g.pct > 95 ? '🟥' : g.pct > 85 ? '🟧' : g.pct > 70 ? '🟨' : '⬜';
    });
    const quiz = this.won ? this.quizScore() : null;
    const head = this.won ? `score ${this.score}${this.hints.length ? ` (${this.hints.length} hint${this.hints.length > 1 ? 's' : ''})` : ''}` : 'X';
    const quizLine =
      quiz && quiz.total ? `\nFacts ${quiz.right}/${quiz.total} ${this.quiz.answers.map((a, i) => (a === this.quiz.questions[i].answer ? '✅' : '❌')).join('')}` : '';
    const streak = this.app.progress.currentStreak(this.dateKey);
    const text = `Globe Trainer ${this.dateKey}: ${head}${streak > 1 ? ` · ${streak}-day streak` : ''}\n${rows.join('')}${quizLine}`;
    navigator.clipboard?.writeText(text).then(
      () => this.app.toast('Result copied'),
      () => this.app.toast(text),
    );
  }
}
