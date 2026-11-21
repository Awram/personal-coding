// Builds the trimmed world topology and country metadata the app loads at runtime.
// Run with: npm run build:data
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { mergeArcs } from 'topojson-client';

const require = createRequire(import.meta.url);
const topology = structuredClone(require('world-atlas/countries-50m.json'));
const countries = require('world-countries');

// Extra names people commonly type. Matching is case and accent insensitive.
const ALIASES = {
  USA: ['America', 'US', 'USA', 'United States of America', 'States'],
  GBR: ['UK', 'Britain', 'Great Britain', 'England', 'Scotland', 'Wales', 'Northern Ireland'],
  CIV: ['Ivory Coast', "Cote d'Ivoire"],
  COD: ['Democratic Republic of the Congo', 'Congo-Kinshasa', 'DRC', 'Zaire'],
  COG: ['Republic of the Congo', 'Congo-Brazzaville', 'Congo'],
  MMR: ['Burma'],
  SWZ: ['Swaziland'],
  MKD: ['Macedonia'],
  CZE: ['Czech Republic'],
  TUR: ['Turkey', 'Turkiye'],
  CPV: ['Cape Verde'],
  TLS: ['East Timor'],
  KOR: ['South Korea', 'Korea'],
  PRK: ['North Korea'],
  LAO: ['Laos'],
  VAT: ['Vatican', 'Holy See'],
  FSM: ['Micronesia'],
  PSE: ['Palestinian Territories', 'West Bank', 'Gaza'],
  ARE: ['UAE', 'Emirates'],
  CAF: ['CAR'],
  BIH: ['Bosnia', 'Herzegovina'],
  NLD: ['Holland'],
  RUS: ['Russian Federation'],
  IRN: ['Persia'],
  LKA: ['Ceylon'],
  BFA: ['Upper Volta'],
  BWA: ['Bechuanaland'],
  KHM: ['Kampuchea'],
  STP: ['Sao Tome'],
  KNA: ['St Kitts', 'Saint Kitts'],
  LCA: ['St Lucia'],
  VCT: ['St Vincent', 'Saint Vincent'],
  TTO: ['Trinidad', 'Tobago'],
  ATG: ['Antigua', 'Barbuda'],
  GNB: ['Guinea Bissau'],
  GNQ: ['Equatorial Guinea'],
  PNG: ['PNG'],
};

// Countries in the core pool that are not UN members.
const EXTRA_CORE = new Set(['TWN', 'PSE', 'UNK', 'VAT']);

const byNumeric = new Map(countries.map((c) => [c.ccn3, c]));
const byCca3 = new Map(countries.map((c) => [c.cca3, c]));
const geoms = topology.objects.countries.geometries;

// Features with no ISO numeric code: fold into a parent, map by name, or drop.
const MERGE_INTO = { Somaliland: '706', 'N. Cyprus': '196' };
const NAME_TO_CCA3 = { Kosovo: 'UNK' };
const DROP = new Set(['Indian Ocean Ter.', 'Siachen Glacier', 'Ashmore and Cartier Is.']);

const kept = [];
const mergeGroups = new Map();
for (const g of geoms) {
  const name = g.properties?.name;
  if (DROP.has(name)) continue;
  if (MERGE_INTO[name]) {
    const parent = MERGE_INTO[name];
    if (!mergeGroups.has(parent)) mergeGroups.set(parent, []);
    mergeGroups.get(parent).push(g);
    continue;
  }
  let meta = g.id ? byNumeric.get(g.id) : byCca3.get(NAME_TO_CCA3[name]);
  if (!meta) {
    console.warn('No metadata for feature, dropping:', g.id, name);
    continue;
  }
  kept.push({ g, meta });
}

for (const entry of kept) {
  const extras = mergeGroups.get(entry.meta.ccn3);
  if (extras) {
    const merged = mergeArcs(topology, [entry.g, ...extras]);
    entry.g = { ...merged };
  }
  entry.g.id = entry.meta.cca3;
  entry.g.properties = {};
}

topology.objects = { countries: { type: 'GeometryCollection', geometries: kept.map((k) => k.g) } };

const haveGeometry = new Set(kept.map((k) => k.meta.cca3));

function inCore(c) {
  return c.unMember || EXTRA_CORE.has(c.cca3);
}

const meta = countries
  .filter((c) => haveGeometry.has(c.cca3) || inCore(c))
  .map((c) => {
    const names = new Set([
      c.name.common,
      c.name.official,
      ...(c.altSpellings || []).filter((s) => s.length > 3 && /^[\p{L}\s.'’,-]+$/u.test(s)),
      ...(ALIASES[c.cca3] || []),
    ]);
    names.delete(c.name.common);
    return {
      id: c.cca3,
      name: c.name.common,
      official: c.name.official,
      aliases: [...names],
      capital: c.capital || [],
      region: c.region,
      subregion: c.subregion || '',
      latlng: c.latlng,
      area: c.area,
      flag: c.flag,
      borders: c.borders || [],
      languages: Object.values(c.languages || {}),
      currencies: Object.values(c.currencies || {}).map((x) => x.name),
      landlocked: c.landlocked,
      core: inCore(c),
      // Countries missing from the 1:50m atlas (e.g. Tuvalu) are drawn as a point.
      pointOnly: !haveGeometry.has(c.cca3),
    };
  });

mkdirSync(new URL('../public/data/', import.meta.url), { recursive: true });
writeFileSync(new URL('../public/data/world-50m.json', import.meta.url), JSON.stringify(topology));
writeFileSync(new URL('../public/data/countries.json', import.meta.url), JSON.stringify(meta));
console.log(
  `Wrote ${kept.length} shapes, ${meta.length} countries (${meta.filter((m) => m.core).length} core, ${meta.filter((m) => m.pointOnly).length} point-only)`,
);
