import { describe, it, expect } from 'vitest';
import { haversineKm, bearing, compassPoint, proximity, heatColor, minDistanceKm, toVector, formatKm } from '../src/geo.js';

describe('geo helpers', () => {
  it('haversine London to Paris is about 344 km', () => {
    expect(haversineKm([-0.1276, 51.5072], [2.3522, 48.8566])).toBeGreaterThan(330);
    expect(haversineKm([-0.1276, 51.5072], [2.3522, 48.8566])).toBeLessThan(360);
  });

  it('bearings point the right way', () => {
    expect(compassPoint(bearing([0, 0], [0, 10]))).toBe('N');
    expect(compassPoint(bearing([0, 0], [10, 0]))).toBe('E');
    expect(compassPoint(bearing([0, 10], [0, 0]))).toBe('S');
    expect(compassPoint(bearing([10, 0], [0, 0]))).toBe('W');
  });

  it('proximity is 100 when touching and 0 at the antipode', () => {
    expect(proximity(0)).toBe(100);
    expect(proximity(20015)).toBe(0);
  });

  it('heat colour gets darker as distance drops', () => {
    const lum = (c) => c.match(/\d+/g).map(Number).reduce((a, b) => a + b, 0);
    expect(lum(heatColor(100))).toBeLessThan(lum(heatColor(5000)));
    expect(lum(heatColor(5000))).toBeLessThan(lum(heatColor(15000)));
  });

  it('minDistanceKm finds the nearest pair of points', () => {
    const a = Float64Array.from([...toVector([0, 0]), ...toVector([1, 0])]);
    const b = Float64Array.from([...toVector([3, 0]), ...toVector([10, 0])]);
    expect(minDistanceKm(a, b)).toBeCloseTo(haversineKm([1, 0], [3, 0]), 0);
  });

  it('formats distances', () => {
    expect(formatKm(1234.4)).toBe('1,234 km');
    expect(formatKm(1000, 'mi')).toBe('621 mi');
  });
});
