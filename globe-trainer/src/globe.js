import { geoOrthographic, geoPath, geoGraticule10, geoContains, geoBounds, geoDistance } from 'd3-geo';

const THEME = {
  oceanInner: '#1d3a5f',
  oceanOuter: '#0c1a2e',
  graticule: 'rgba(160, 200, 255, 0.08)',
  land: '#d9d4c7',
  landStroke: 'rgba(60, 60, 60, 0.35)',
  outline: 'rgba(160, 200, 255, 0.35)',
  label: '#ffffff',
  labelHalo: 'rgba(0, 0, 0, 0.75)',
  tinyRing: 'rgba(255, 255, 255, 0.45)',
};

/**
 * Interactive orthographic globe drawn on a canvas.
 * Drag to rotate, wheel or pinch to zoom, click to pick a country.
 */
export class Globe {
  constructor(canvas, world, { onPick } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.onPick = onPick;
    this.projection = geoOrthographic().clipAngle(90).precision(0.4);
    this.path = geoPath(this.projection, this.ctx);
    this.graticule = geoGraticule10();
    this.rotation = [-10, -20, 0];
    this.zoom = 1;
    this.styles = new Map(); // id -> { fill, stroke, label, pulse }
    this.options = { borders: true, tinyDots: false, labels: true, land: true };
    this.autoRotate = true;
    this._anim = null;
    this._raf = null;
    this._lastInteraction = 0;
    this._bounds = new Map(world.countries.map((c) => [c.id, geoBounds(c.feature)]));
    this._bindEvents();
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(canvas.parentElement);
    this.resize();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const size = Math.max(200, Math.min(rect.width, rect.height || rect.width));
    const dpr = window.devicePixelRatio || 1;
    this.size = size;
    this.dpr = dpr;
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    this.canvas.width = Math.round(size * dpr);
    this.canvas.height = Math.round(size * dpr);
    this.requestDraw();
  }

  setStyles(styles) {
    this.styles = styles;
    this.requestDraw();
  }

  setOptions(opts) {
    Object.assign(this.options, opts);
    this.requestDraw();
  }

  requestDraw() {
    this._dirty = true;
  }

  /** Animate the view to centre on [lon, lat]. */
  flyTo(center, zoom = this.zoom, duration = 900) {
    const from = { rot: [...this.rotation], zoom: this.zoom };
    const to = { rot: [-center[0], -center[1], 0], zoom };
    // Take the short way round in longitude.
    let dl = to.rot[0] - from.rot[0];
    dl = ((((dl + 180) % 360) + 360) % 360) - 180;
    to.rot[0] = from.rot[0] + dl;
    this._anim = { from, to, start: performance.now(), duration };
    this.autoRotate = false;
  }

  /** Fly to a country with a zoom that fits its size. */
  flyToCountry(c, duration) {
    const a = c.angularArea; // steradians
    let zoom = 1;
    if (a < 0.0005) zoom = 6;
    else if (a < 0.003) zoom = 4;
    else if (a < 0.015) zoom = 2.6;
    else if (a < 0.06) zoom = 1.8;
    else if (a < 0.2) zoom = 1.3;
    this.flyTo(c.center, zoom, duration);
  }

  _loop(now) {
    if (this._anim) {
      const { from, to, start, duration } = this._anim;
      let t = Math.min(1, (now - start) / duration);
      t = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2; // ease in-out
      this.rotation = from.rot.map((v, i) => v + (to.rot[i] - v) * t);
      this.zoom = from.zoom + (to.zoom - from.zoom) * t;
      if (t >= 1) this._anim = null;
      this._dirty = true;
    } else if (this.autoRotate && !this._dragging && now - this._lastInteraction > 4000) {
      this.rotation[0] += 0.08;
      this._dirty = true;
    }
    if (this._dirty) {
      this._dirty = false;
      this.draw();
    }
    this._raf = requestAnimationFrame(this._loop);
  }

  _viewCenter() {
    return [-this.rotation[0], -this.rotation[1]];
  }

  _isVisible(lonlat) {
    return geoDistance(lonlat, this._viewCenter()) < Math.PI / 2 - 0.02;
  }

  draw() {
    const { ctx, projection, path, size, dpr } = this;
    const radius = (size / 2 - 6) * this.zoom;
    projection.translate([size / 2, size / 2]).scale(radius).rotate(this.rotation);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    // Ocean
    const grad = ctx.createRadialGradient(size / 2 - radius * 0.3, size / 2 - radius * 0.3, radius * 0.1, size / 2, size / 2, radius);
    grad.addColorStop(0, THEME.oceanInner);
    grad.addColorStop(1, THEME.oceanOuter);
    ctx.beginPath();
    path({ type: 'Sphere' });
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    path(this.graticule);
    ctx.strokeStyle = THEME.graticule;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Base land
    if (this.options.land) {
      ctx.beginPath();
      for (const c of this.world.countries) if (!c.pointOnly) path(c.feature);
      for (const f of this.world.extraLand) path(f);
      ctx.fillStyle = THEME.land;
      ctx.fill();
      if (this.options.borders) {
        ctx.strokeStyle = THEME.landStroke;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }

    // Styled countries
    for (const [id, s] of this.styles) {
      const c = this.world.get(id);
      if (!c || c.pointOnly) continue;
      ctx.beginPath();
      path(c.feature);
      if (s.fill) {
        ctx.fillStyle = s.fill;
        ctx.fill();
      }
      ctx.strokeStyle = s.stroke || 'rgba(0,0,0,0.5)';
      ctx.lineWidth = s.strokeWidth || 0.8;
      ctx.stroke();
    }

    // Markers for countries too small to see at this zoom. Coloured countries
    // (guesses, answers) always get one; plain ones only when the mode asks for
    // it (Finder, so they can be tapped), drawn as faint rings.
    const pulse = (Math.sin(performance.now() / 250) + 1) / 2;
    let needsPulse = false;
    for (const c of this.world.countries) {
      if (!this._hasMarker(c)) continue;
      const s = this.styles.get(c.id);
      const [x, y] = projection(c.center);
      ctx.beginPath();
      if (s) {
        ctx.arc(x, y, 4 + Math.min(3, this.zoom), 0, Math.PI * 2);
        ctx.fillStyle = s.fill || THEME.land;
        ctx.fill();
        ctx.strokeStyle = s.stroke || 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 1.2;
      } else {
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.strokeStyle = THEME.tinyRing;
        ctx.lineWidth = 1;
      }
      ctx.stroke();
    }

    // Pulsing ring for highlighted targets
    for (const [id, s] of this.styles) {
      if (!s.pulse) continue;
      const c = this.world.get(id);
      if (!c || !this._isVisible(c.center)) continue;
      needsPulse = true;
      const [x, y] = projection(c.center);
      ctx.beginPath();
      ctx.arc(x, y, 10 + pulse * 10, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 230, 90, ${0.9 - pulse * 0.6})`;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // Outline
    ctx.beginPath();
    path({ type: 'Sphere' });
    ctx.strokeStyle = THEME.outline;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Labels
    if (this.options.labels) {
      ctx.font = '600 12px system-ui, -apple-system, Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const [id, s] of this.styles) {
        if (!s.label) continue;
        const c = this.world.get(id);
        if (!c || !this._isVisible(c.center)) continue;
        const [x, y] = projection(c.center);
        const ly = c.tiny ? y - 14 : y;
        ctx.lineWidth = 3;
        ctx.strokeStyle = THEME.labelHalo;
        ctx.strokeText(s.label, x, ly);
        ctx.fillStyle = THEME.label;
        ctx.fillText(s.label, x, ly);
      }
    }

    if (needsPulse) this._dirty = true;
  }

  /** True when a country is under ~3px across on screen right now. */
  _isTooSmall(c) {
    if (c.pointOnly) return true;
    const px = Math.sqrt(c.angularArea / Math.PI) * this.projection.scale();
    return px < 3;
  }

  _hasMarker(c) {
    if (!c.tiny || !this._isVisible(c.center) || !this._isTooSmall(c)) return false;
    return this.styles.has(c.id) || this.options.tinyDots;
  }

  /** Country under a canvas-relative point, or null. */
  pick(x, y) {
    const lonlat = this.projection.invert([x, y]);
    if (!lonlat || Number.isNaN(lonlat[0]) || !this._isVisible(lonlat)) return null;
    // Small-country markers first, by screen distance.
    let best = null;
    let bestD = 12;
    for (const c of this.world.countries) {
      if (!this._hasMarker(c)) continue;
      const [cx, cy] = this.projection(c.center);
      const d = Math.hypot(cx - x, cy - y);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (best) return best;
    for (const c of this.world.countries) {
      if (c.pointOnly) continue;
      const [[w, s], [e, n]] = this._bounds.get(c.id);
      const [lon, lat] = lonlat;
      if (lat < s - 0.5 || lat > n + 0.5) continue;
      const inLon = w <= e ? lon >= w - 0.5 && lon <= e + 0.5 : lon >= w - 0.5 || lon <= e + 0.5;
      if (!inLon) continue;
      if (geoContains(c.feature, lonlat)) return c;
    }
    return null;
  }

  _bindEvents() {
    const el = this.canvas;
    const pointers = new Map();
    let start = null;
    let pinchStart = null;
    let moved = 0;

    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this._dragging = true;
      this._anim = null;
      this._lastInteraction = performance.now();
      moved = 0;
      start = { x: e.clientX, y: e.clientY, rot: [...this.rotation] };
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.zoom };
      }
    });

    el.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this._lastInteraction = performance.now();
      if (pointers.size === 2 && pinchStart) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.setZoom(pinchStart.zoom * (d / pinchStart.dist));
        moved = 99;
        return;
      }
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      moved = Math.max(moved, Math.hypot(dx, dy));
      const k = 90 / ((this.size / 2) * this.zoom);
      this.rotation = [start.rot[0] + dx * k, Math.max(-90, Math.min(90, start.rot[1] - dy * k)), 0];
      this.requestDraw();
    });

    const end = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchStart = null;
      if (pointers.size === 0) {
        this._dragging = false;
        if (moved < 5 && e.type === 'pointerup' && this.onPick) {
          const rect = el.getBoundingClientRect();
          const c = this.pick(e.clientX - rect.left, e.clientY - rect.top);
          this.onPick(c);
        }
        start = null;
      } else {
        const [p] = [...pointers.values()];
        start = { x: p.x, y: p.y, rot: [...this.rotation] };
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);

    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this._lastInteraction = performance.now();
        this._anim = null;
        this.setZoom(this.zoom * Math.exp(-e.deltaY * 0.0015));
      },
      { passive: false },
    );
  }

  setZoom(z) {
    this.zoom = Math.max(0.8, Math.min(12, z));
    this.requestDraw();
  }

  stopAutoRotate() {
    this.autoRotate = false;
  }
}
