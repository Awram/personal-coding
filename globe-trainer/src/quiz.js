// Fact quiz shown after you find the daily country: capital, population,
// languages and currency, each as a four-option question. Pure logic, no DOM.

export function formatPopulation(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)} billion`;
  if (n >= 1e6) return `${n >= 1e7 ? Math.round(n / 1e6) : (n / 1e6).toFixed(1)} million`;
  if (n >= 1e4) return `${Math.round(n / 1000).toLocaleString('en')},000`;
  if (n >= 1000) return `${(Math.round(n / 100) * 100).toLocaleString('en')}`;
  return `${Math.round(n)}`;
}

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Countries ordered by distance between their centres, nearest first. */
function nearest(target, countries) {
  const t = target.centerVec;
  return countries
    .filter((c) => c.id !== target.id)
    .map((c) => ({ c, d: -(c.centerVec[0] * t[0] + c.centerVec[1] * t[1] + c.centerVec[2] * t[2]) }))
    .sort((a, b) => a.d - b.d)
    .map((x) => x.c);
}

/** Pick up to n distinct values from candidates that aren't in `exclude`. */
function pickDistinct(candidates, exclude, n, rng, poolSize = 12) {
  const seen = new Set(exclude.map((x) => x.toLowerCase()));
  const out = [];
  for (const v of candidates) {
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
    if (out.length >= poolSize) break;
  }
  return shuffle(out, rng).slice(0, n);
}

function question(type, prompt, answer, distractors, rng, extra = {}) {
  if (!answer || distractors.length < 3) return null;
  return { type, prompt, answer, options: shuffle([answer, ...distractors.slice(0, 3)], rng), ...extra };
}

/**
 * Build the quiz for a country. `countries` is the pool to draw wrong answers from.
 * Questions without enough data (e.g. no capital) are skipped.
 */
export function buildQuiz(target, countries, rng = Math.random) {
  const near = nearest(target, countries);
  const qs = [];

  // Capital: wrong options are capitals of nearby countries, so it's a fair test.
  const capital = target.capital[0];
  qs.push(
    question(
      'capital',
      `What is the capital of ${target.name}?`,
      capital,
      pickDistinct(near.map((c) => c.capital[0]), [capital], 3, rng, 8),
      rng,
      { all: target.capital },
    ),
  );

  // Population: real figures of countries at clearly different sizes.
  if (target.population) {
    const answer = formatPopulation(target.population);
    const ratio = (c) => Math.abs(Math.log10(c.population / target.population));
    const others = countries
      .filter((c) => c.id !== target.id && c.population)
      .filter((c) => ratio(c) > 0.3 && ratio(c) < 1.6);
    const picks = [];
    for (const c of shuffle(others, rng)) {
      const v = formatPopulation(c.population);
      if (v === answer || picks.some((p) => Math.abs(Math.log10(p.population / c.population)) < 0.25)) continue;
      picks.push(c);
      if (picks.length === 3) break;
    }
    qs.push(
      question('population', `Roughly how many people live in ${target.name}?`, answer, picks.map((c) => formatPopulation(c.population)), rng, {
        note: 'World Bank 2018 figures',
        sortNumeric: true,
      }),
    );
  }

  // Languages: one of the country's official languages vs. languages spoken nearby.
  if (target.languages.length) {
    const answer = target.languages[0];
    const nearbyLangs = near.flatMap((c) => c.languages);
    const common = ['English', 'French', 'Spanish', 'Arabic', 'Portuguese', 'Russian', 'German', 'Swahili', 'Hindi', 'Mandarin'];
    const distractors = pickDistinct([...nearbyLangs, ...shuffle(common, rng)], target.languages, 3, rng, 8);
    qs.push(
      question(
        'languages',
        target.languages.length > 1 ? `Which of these is an official language of ${target.name}?` : `What is the official language of ${target.name}?`,
        answer,
        distractors,
        rng,
        { all: target.languages },
      ),
    );
  }

  // Currency
  if (target.currencies.length) {
    const answer = target.currencies[0];
    const distractors = pickDistinct(near.flatMap((c) => c.currencies), target.currencies, 3, rng, 8);
    qs.push(question('currency', `What currency is used in ${target.name}?`, answer, distractors, rng, { all: target.currencies }));
  }

  return qs.filter(Boolean).map((q) => {
    if (!q.sortNumeric) return q;
    // Population options read best smallest to largest.
    const val = (s) => {
      const n = parseFloat(s.replace(/,/g, ''));
      return s.includes('billion') ? n * 1e9 : s.includes('million') ? n * 1e6 : n;
    };
    return { ...q, options: [...q.options].sort((a, b) => val(a) - val(b)) };
  });
}

export const QUIZ_LABELS = { capital: 'Capital', population: 'Population', languages: 'Language', currency: 'Currency' };
