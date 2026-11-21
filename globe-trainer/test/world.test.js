import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildWorld } from '../src/data.js';
import { CountryIndex } from '../src/search.js';

let world;
let index;
beforeAll(() => {
  const topo = JSON.parse(readFileSync(new URL('../public/data/world-50m.json', import.meta.url)));
  const meta = JSON.parse(readFileSync(new URL('../public/data/countries.json', import.meta.url)));
  world = buildWorld(topo, meta);
  index = new CountryIndex(world.countries);
});

const d = (a, b) => world.distance(world.get(a), world.get(b));

describe('world data', () => {
  it('has every UN member plus a few others in the core pool', () => {
    expect(world.pool().length).toBeGreaterThanOrEqual(196);
  });

  it('neighbours are 0 km apart', () => {
    expect(d('FRA', 'ESP')).toBe(0);
    expect(d('CAN', 'USA')).toBe(0);
  });

  it('measures border to border, not centre to centre', () => {
    // Dover Strait is ~34 km
    expect(d('GBR', 'FRA')).toBeGreaterThan(20);
    expect(d('GBR', 'FRA')).toBeLessThan(60);
    // Russia and USA across the Bering Strait (~80 km between mainlands, less via islands)
    expect(d('RUS', 'USA')).toBeLessThan(100);
    // Australia to New Zealand: ~630 km via Macquarie Island and the Auckland Islands
    expect(d('AUS', 'NZL')).toBeGreaterThan(400);
    expect(d('AUS', 'NZL')).toBeLessThan(2200);
  });

  it('is symmetric and handles point-only countries', () => {
    expect(d('BRA', 'JPN')).toBeCloseTo(d('JPN', 'BRA'), 5);
    expect(Number.isFinite(d('TUV', 'FJI'))).toBe(true);
  });
});

describe('name search', () => {
  it('resolves common names and aliases', () => {
    expect(index.resolve('usa').id).toBe('USA');
    expect(index.resolve('Ivory Coast').id).toBe('CIV');
    expect(index.resolve("côte d'ivoire").id).toBe('CIV');
    expect(index.resolve('burma').id).toBe('MMR');
    expect(index.resolve('uk').id).toBe('GBR');
    expect(index.resolve('Saint Lucia').id).toBe('LCA');
  });

  it('suggests by prefix', () => {
    const names = index.suggest('nig').map((s) => s.country.id);
    expect(names).toContain('NGA');
    expect(names).toContain('NER');
  });
});
