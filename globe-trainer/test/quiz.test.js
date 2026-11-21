import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildWorld } from '../src/data.js';
import { buildQuiz, formatPopulation } from '../src/quiz.js';

let world;
beforeAll(() => {
  const topo = JSON.parse(readFileSync(new URL('../public/data/world-50m.json', import.meta.url)));
  const meta = JSON.parse(readFileSync(new URL('../public/data/countries.json', import.meta.url)));
  world = buildWorld(topo, meta);
});

describe('fact quiz', () => {
  it('formats populations readably', () => {
    expect(formatPopulation(1352617328)).toBe('1.4 billion');
    expect(formatPopulation(66987244)).toBe('67 million');
    expect(formatPopulation(4890000)).toBe('4.9 million');
    expect(formatPopulation(825)).toBe('825');
  });

  it('every core country has population data', () => {
    expect(world.pool().filter((c) => !c.population).map((c) => c.id)).toEqual([]);
  });

  it('builds four sound questions for every core country', () => {
    const pool = world.pool({ includeTerritories: true });
    for (const c of world.pool()) {
      const qs = buildQuiz(c, pool);
      for (const q of qs) {
        expect(q.options).toHaveLength(4);
        expect(q.options).toContain(q.answer);
        expect(new Set(q.options.map((o) => o.toLowerCase())).size).toBe(4);
        if (q.all) expect(q.options.filter((o) => q.all.includes(o))).toEqual([q.answer]);
      }
      // Capital and population at minimum; most countries get all four.
      expect(qs.length).toBeGreaterThanOrEqual(c.capital.length ? 3 : 2);
    }
  });

  it('asks about France in the expected order', () => {
    const qs = buildQuiz(world.get('FRA'), world.pool());
    expect(qs.map((q) => q.type)).toEqual(['capital', 'population', 'languages', 'currency']);
    expect(qs[0].answer).toBe('Paris');
    expect(qs[3].answer).toBe('Euro');
  });
});
