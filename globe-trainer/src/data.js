import { feature } from 'topojson-client';
import { geoArea, geoCentroid } from 'd3-geo';
import { geometryVectors, minDistanceKm, bearing, toVector } from './geo.js';

export const REGIONS = [
  { id: 'world', label: 'Whole world', test: () => true },
  { id: 'africa', label: 'Africa', test: (c) => c.region === 'Africa' },
  { id: 'europe', label: 'Europe', test: (c) => c.region === 'Europe' },
  { id: 'asia', label: 'Asia', test: (c) => c.region === 'Asia' },
  { id: 'middle-east', label: 'Middle East', test: (c) => c.subregion === 'Western Asia' || ['EGY', 'IRN'].includes(c.id) },
  { id: 'north-america', label: 'North & Central America', test: (c) => ['North America', 'Central America'].includes(c.subregion) },
  { id: 'caribbean', label: 'Caribbean', test: (c) => c.subregion === 'Caribbean' },
  { id: 'south-america', label: 'South America', test: (c) => c.subregion === 'South America' },
  { id: 'oceania', label: 'Oceania', test: (c) => c.region === 'Oceania' },
];

// Countries smaller than this (km²) get a dot marker so they can be seen and clicked.
export const TINY_AREA_KM2 = 15000;

export async function loadWorld(base = import.meta.env?.BASE_URL ?? '/') {
  const [topo, meta] = await Promise.all([
    fetch(`${base}data/world-50m.json`).then((r) => r.json()),
    fetch(`${base}data/countries.json`).then((r) => r.json()),
  ]);
  return buildWorld(topo, meta);
}

export function buildWorld(topo, meta) {
  const fc = feature(topo, topo.objects.countries);
  const featureById = new Map(fc.features.map((f) => [f.id, f]));
  const countries = meta.map((m) => {
    const f = featureById.get(m.id) || {
      type: 'Feature',
      id: m.id,
      properties: {},
      geometry: { type: 'Point', coordinates: [m.latlng[1], m.latlng[0]] },
    };
    // world-countries latlng is a good "main landmass" centre; fall back to centroid.
    const center = m.latlng?.length === 2 ? [m.latlng[1], m.latlng[0]] : geoCentroid(f);
    return {
      ...m,
      feature: f,
      center,
      centerVec: toVector(center),
      tiny: m.pointOnly || m.area < TINY_AREA_KM2,
      // Angular size, used to pick a zoom level when flying to the country.
      angularArea: f.geometry.type === 'Point' ? 0 : geoArea(f),
      _vectors: null,
    };
  });
  const byId = new Map(countries.map((c) => [c.id, c]));
  // Shapes with geometry but no metadata are still drawn as plain land.
  const extraLand = fc.features.filter((f) => !byId.has(f.id));
  return new World(countries, byId, extraLand);
}

export class World {
  constructor(countries, byId, extraLand) {
    this.countries = countries;
    this.byId = byId;
    this.extraLand = extraLand;
    this._distCache = new Map();
  }

  get(id) {
    return this.byId.get(id);
  }

  vectors(c) {
    if (!c._vectors) c._vectors = geometryVectors(c.feature.geometry);
    return c._vectors;
  }

  /** Border-to-border distance in km (0 for neighbours). Cached. */
  distance(a, b) {
    if (a.id === b.id) return 0;
    const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
    if (this._distCache.has(key)) return this._distCache.get(key);
    let d;
    if (a.borders.includes(b.id) || b.borders.includes(a.id)) d = 0;
    else d = minDistanceKm(this.vectors(a), this.vectors(b));
    this._distCache.set(key, d);
    return d;
  }

  bearing(from, to) {
    return bearing(from.center, to.center);
  }

  pool({ region = 'world', includeTerritories = false } = {}) {
    const r = REGIONS.find((x) => x.id === region) || REGIONS[0];
    return this.countries.filter((c) => (includeTerritories || c.core) && c.id !== 'ATA' && r.test(c));
  }
}
