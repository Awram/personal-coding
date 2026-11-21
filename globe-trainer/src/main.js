import './styles.css';
import { loadWorld, REGIONS } from './data.js';
import { Globe } from './globe.js';
import { CountryIndex } from './search.js';
import { Progress } from './progress.js';
import { HuntMode } from './modes/hunt.js';
import { LocateMode } from './modes/locate.js';
import { NameMode } from './modes/name.js';
import { ProgressMode } from './modes/progress-view.js';

const MODES = { hunt: HuntMode, locate: LocateMode, name: NameMode, progress: ProgressMode };
const DEFAULT_SETTINGS = {
  region: 'world',
  territories: false,
  borders: true,
  tinyDots: true,
  labels: true,
  choices: false,
  units: 'km',
};

async function start() {
  const world = await loadWorld();
  document.getElementById('loading').remove();

  const progress = new Progress();
  const settings = { ...DEFAULT_SETTINGS, ...progress.getSetting('app', {}) };
  const index = new CountryIndex(world.countries);
  const panel = document.getElementById('panel');
  let current = null;

  const globe = new Globe(document.getElementById('globe'), world, {
    onPick: (c) => current?.onPick?.(c),
  });
  globe.setOptions({ borders: settings.borders, tinyDots: settings.tinyDots, labels: settings.labels });

  const toastEl = document.getElementById('toast');
  let toastTimer;
  const toast = (msg) => {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
  };

  const app = {
    world,
    globe,
    progress,
    index,
    settings,
    toast,
    pool: () => world.pool({ region: settings.region, includeTerritories: settings.territories }),
    regionLabel: () => REGIONS.find((r) => r.id === settings.region)?.label ?? 'Whole world',
    switchMode,
  };

  function switchMode(name) {
    current?.unmount?.();
    panel.innerHTML = '';
    globe.setStyles(new Map());
    document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === name)));
    current = new MODES[name](app);
    current.mount(panel);
    progress.setSetting('mode', name);
  }

  document.querySelector('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (b) switchMode(b.dataset.mode);
  });

  // Zoom controls
  document.querySelector('.globe-controls').addEventListener('click', (e) => {
    const b = e.target.closest('[data-zoom]');
    if (!b) return;
    globe.stopAutoRotate();
    if (b.dataset.zoom === 'in') globe.setZoom(globe.zoom * 1.4);
    else if (b.dataset.zoom === 'out') globe.setZoom(globe.zoom / 1.4);
    else globe.flyTo(globe._viewCenter(), 1, 500);
  });

  // Settings dialog
  const dialog = document.getElementById('settings');
  const form = dialog.querySelector('form');
  form.region.innerHTML = REGIONS.map((r) => `<option value="${r.id}">${r.label}</option>`).join('');
  document.getElementById('settings-btn').addEventListener('click', () => {
    for (const [k, v] of Object.entries(settings)) {
      const field = form.elements[k];
      if (!field) continue;
      if (field.type === 'checkbox') field.checked = v;
      else field.value = v;
    }
    dialog.showModal();
  });
  dialog.addEventListener('close', () => {
    const before = JSON.stringify(settings);
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      const field = form.elements[k];
      settings[k] = field.type === 'checkbox' ? field.checked : field.value;
    }
    progress.setSetting('app', settings);
    globe.setOptions({ borders: settings.borders, tinyDots: settings.tinyDots, labels: settings.labels });
    if (JSON.stringify(settings) !== before) current?.onSettingsChange?.();
  });

  switchMode(progress.getSetting('mode', 'hunt'));
}

// Offline support and "Add to Home Screen" (production builds only).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

start().catch((err) => {
  console.error(err);
  const el = document.getElementById('loading');
  if (el) el.textContent = 'Could not load map data. Try refreshing.';
});
