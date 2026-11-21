// Country name matching and autocomplete.

export function normalize(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`.]/g, '')
    .replace(/&/g, 'and')
    .replace(/\bsaint\b/g, 'st')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export class CountryIndex {
  constructor(countries) {
    this.entries = [];
    this.exact = new Map();
    for (const c of countries) {
      const names = [c.name, ...c.aliases];
      for (const [i, n] of names.entries()) {
        const key = normalize(n);
        if (!key) continue;
        this.entries.push({ key, label: n, country: c, primary: i === 0 });
        if (!this.exact.has(key) || i === 0) this.exact.set(key, c);
      }
    }
  }

  /** Resolve free text to a country, or null. */
  resolve(text) {
    const key = normalize(text);
    if (!key) return null;
    if (this.exact.has(key)) return this.exact.get(key);
    const hits = this.suggest(text, 2);
    return hits.length === 1 ? hits[0].country : null;
  }

  /** Ranked suggestions, one per country. */
  suggest(text, limit = 8, filter = null) {
    const key = normalize(text);
    if (!key) return [];
    const scored = new Map();
    for (const e of this.entries) {
      if (filter && !filter(e.country)) continue;
      let score = -1;
      if (e.key === key) score = 100;
      else if (e.key.startsWith(key)) score = 80 - e.key.length / 10;
      else if (e.key.split(' ').some((w) => w.startsWith(key))) score = 60 - e.key.length / 10;
      else if (key.length >= 3 && e.key.includes(key)) score = 40;
      if (score < 0) continue;
      if (e.primary) score += 5;
      const prev = scored.get(e.country.id);
      if (!prev || prev.score < score) scored.set(e.country.id, { country: e.country, label: e.label, score });
    }
    return [...scored.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  }
}
