// Pure geometry helpers: distances, bearings and colours. No DOM access here.

export const EARTH_RADIUS_KM = 6371;
export const MAX_DISTANCE_KM = Math.PI * EARTH_RADIUS_KM; // half the circumference
const RAD = Math.PI / 180;

/** [lon, lat] in degrees -> unit vector [x, y, z]. */
export function toVector([lon, lat]) {
  const l = lon * RAD;
  const p = lat * RAD;
  const c = Math.cos(p);
  return [c * Math.cos(l), c * Math.sin(l), Math.sin(p)];
}

/** Great-circle distance in km between two [lon, lat] points. */
export function haversineKm(a, b) {
  const dLat = (b[1] - a[1]) * RAD;
  const dLon = (b[0] - a[0]) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Flatten every vertex of a GeoJSON geometry into a Float64Array of unit vectors
 * (x0, y0, z0, x1, ...). Used for fast border-to-border distance checks.
 */
export function geometryVectors(geometry) {
  const out = [];
  const push = (pt) => out.push(...toVector(pt));
  const walk = (coords, depth) => {
    if (depth === 0) push(coords);
    else for (const c of coords) walk(c, depth - 1);
  };
  if (!geometry) return new Float64Array(0);
  if (geometry.type === 'Point') walk(geometry.coordinates, 0);
  else if (geometry.type === 'MultiPoint' || geometry.type === 'LineString') walk(geometry.coordinates, 1);
  else if (geometry.type === 'Polygon' || geometry.type === 'MultiLineString') walk(geometry.coordinates, 2);
  else if (geometry.type === 'MultiPolygon') walk(geometry.coordinates, 3);
  return Float64Array.from(out);
}

function bestDotBrute(a, b, stepA, stepB, ia0 = 0, ia1 = a.length, ib0 = 0, ib1 = b.length) {
  let best = -2;
  let bi = 0;
  let bj = 0;
  for (let i = ia0; i < ia1; i += stepA * 3) {
    const ax = a[i];
    const ay = a[i + 1];
    const az = a[i + 2];
    for (let j = ib0; j < ib1; j += stepB * 3) {
      const d = ax * b[j] + ay * b[j + 1] + az * b[j + 2];
      if (d > best) {
        best = d;
        bi = i;
        bj = j;
      }
    }
  }
  return { best, bi, bj };
}

/**
 * Shortest distance in km between the vertices of two shapes (vector arrays from
 * geometryVectors). Uses a coarse pass on a subsample, then refines around the
 * closest pair at full resolution so large countries stay fast and accurate.
 */
export function minDistanceKm(a, b) {
  if (!a.length || !b.length) return Infinity;
  const na = a.length / 3;
  const nb = b.length / 3;
  const target = 1500;
  const stepA = Math.max(1, Math.floor(na / target));
  const stepB = Math.max(1, Math.floor(nb / target));
  let { best, bi, bj } = bestDotBrute(a, b, stepA, stepB);
  if (stepA > 1 || stepB > 1) {
    // Refine in a window around the coarse winner.
    const wa = stepA * 3 * 4;
    const wb = stepB * 3 * 4;
    const r = bestDotBrute(
      a,
      b,
      1,
      1,
      Math.max(0, bi - wa),
      Math.min(a.length, bi + wa + 3),
      Math.max(0, bj - wb),
      Math.min(b.length, bj + wb + 3),
    );
    if (r.best > best) best = r.best;
  }
  return Math.acos(Math.min(1, Math.max(-1, best))) * EARTH_RADIUS_KM;
}

/** Initial great-circle bearing in degrees (0 = north, clockwise) from a to b ([lon, lat]). */
export function bearing(a, b) {
  const p1 = a[1] * RAD;
  const p2 = b[1] * RAD;
  const dl = (b[0] - a[0]) * RAD;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export function compassPoint(deg) {
  return COMPASS[Math.round(deg / 45) % 8];
}

/** 0..100, where 100 means touching and 0 means the opposite side of the planet. */
export function proximity(km) {
  if (!Number.isFinite(km)) return 0;
  return Math.max(0, Math.round(100 * (1 - km / MAX_DISTANCE_KM)));
}

// Heat ramp by distance in km: pale sand (far) through orange to deep crimson (touching).
const RAMP = [
  [0, [110, 8, 30]],
  [250, [168, 22, 38]],
  [750, [212, 52, 44]],
  [1500, [238, 98, 52]],
  [3000, [248, 148, 70]],
  [6000, [253, 196, 120]],
  [10000, [255, 226, 176]],
  [MAX_DISTANCE_KM, [255, 246, 222]],
];

/** Colour for a guess at the given distance. Closer is hotter, with most of the
 * colour change in the last few thousand km where it matters. */
export function heatColor(km) {
  const d = Math.max(0, Math.min(MAX_DISTANCE_KM, km));
  for (let i = 1; i < RAMP.length; i++) {
    const [k1, c1] = RAMP[i];
    const [k0, c0] = RAMP[i - 1];
    if (d <= k1) {
      const f = (d - k0) / (k1 - k0);
      const c = c0.map((v, j) => Math.round(v + (c1[j] - v) * f));
      return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    }
  }
  return 'rgb(255, 246, 222)';
}

export function formatKm(km, units = 'km') {
  if (!Number.isFinite(km)) return '?';
  if (units === 'mi') {
    const mi = km * 0.621371;
    return `${mi < 10 ? mi.toFixed(1) : Math.round(mi).toLocaleString()} mi`;
  }
  return `${km < 10 ? km.toFixed(1) : Math.round(km).toLocaleString()} km`;
}
