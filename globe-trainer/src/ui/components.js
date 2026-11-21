import { formatKm } from '../geo.js';
import { formatPopulation } from '../quiz.js';

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Phones and tablets: the input opens as a full-screen picker that sits above the
// on-screen keyboard, so suggestions are never hidden behind it.
export const isTouch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const useSheet = () => typeof matchMedia === 'function' && matchMedia('(max-width: 900px), (pointer: coarse)').matches;

function trackViewport() {
  const vv = window.visualViewport;
  const set = () => {
    const top = vv ? vv.offsetTop : 0;
    const height = vv ? vv.height : window.innerHeight;
    document.documentElement.style.setProperty('--vv-top', `${top}px`);
    document.documentElement.style.setProperty('--vv-h', `${height}px`);
  };
  set();
  vv?.addEventListener('resize', set);
  vv?.addEventListener('scroll', set);
  return () => {
    vv?.removeEventListener('resize', set);
    vv?.removeEventListener('scroll', set);
  };
}

/**
 * Text input with a country suggestion list.
 * onSubmit(country | null, rawText) fires on Enter or when a suggestion is chosen.
 * `exclude` is an optional list of ids shown as already used.
 */
export function autocomplete({ index, placeholder = 'Type a country…', filter = null, exclude = [], onSubmit }) {
  const el = h(`
    <div class="ac">
      <div class="ac-bar">
        <input type="text" autocomplete="off" autocorrect="off" autocapitalize="words" spellcheck="false"
          enterkeyhint="go" role="combobox" aria-expanded="false" aria-autocomplete="list"
          placeholder="${esc(placeholder)}" />
        <button type="button" class="ac-cancel btn ghost small">Cancel</button>
      </div>
      <ul role="listbox" hidden></ul>
    </div>`);
  const input = el.querySelector('input');
  const list = el.querySelector('ul');
  const cancel = el.querySelector('.ac-cancel');
  let items = [];
  let active = -1;
  let stopTracking = null;

  const openSheet = () => {
    if (!useSheet() || el.classList.contains('sheet')) return;
    stopTracking = trackViewport();
    // Keep the panel layout steady while the input floats above it.
    el.style.setProperty('--ac-h', `${el.offsetHeight}px`);
    el.classList.add('sheet');
    document.body.classList.add('sheet-open');
    el.style.setProperty('--ac-bar-h', `${el.querySelector('.ac-bar').offsetHeight}px`);
    render();
  };
  const closeSheet = () => {
    if (!el.classList.contains('sheet')) return;
    el.classList.remove('sheet');
    document.body.classList.remove('sheet-open');
    stopTracking?.();
    stopTracking = null;
  };
  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    active = -1;
  };
  const render = () => {
    const text = input.value.trim();
    const sheet = el.classList.contains('sheet');
    items = text ? index.suggest(text, sheet ? 30 : 8, filter) : [];
    if (!text) {
      if (sheet) {
        list.innerHTML = '<li class="ac-empty">Start typing a country name</li>';
        list.hidden = false;
      } else close();
      return;
    }
    if (!items.length) {
      list.innerHTML = `<li class="ac-empty">No country matches “${esc(text)}”</li>`;
      list.hidden = false;
      return;
    }
    list.innerHTML = items
      .map((it, i) => {
        const used = exclude.includes(it.country.id);
        return `<li role="option" data-i="${i}" aria-selected="${i === active}" class="${used ? 'used' : ''}">
          <span class="ac-name"><span class="ac-flag">${it.country.flag || ''}</span>${esc(it.country.name)}</span>
          <span class="alias">${used ? 'guessed' : it.label !== it.country.name ? esc(it.label) : ''}</span>
        </li>`;
      })
      .join('');
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };
  const choose = (country) => {
    close();
    input.value = '';
    if (useSheet()) input.blur();
    onSubmit(country, '');
  };

  input.addEventListener('focus', openSheet);
  input.addEventListener('input', () => {
    active = -1;
    render();
    list.scrollTop = 0;
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (list.hidden || !items.length) return;
      e.preventDefault();
      const d = e.key === 'ArrowDown' ? 1 : -1;
      active = (active + d + items.length) % items.length;
      render();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0 && items[active]) return choose(items[active].country);
      const text = input.value;
      const exact = index.resolve(text);
      if (exact) return choose(exact);
      if (items.length) return choose(items[0].country);
      if (text.trim()) onSubmit(null, text);
    } else if (e.key === 'Escape') {
      close();
      input.blur();
    }
  });
  // Mouse: preventDefault keeps focus in the input. Touch: a tap or scroll in the
  // list may blur the input (dropping the keyboard); the sheet stays open until a
  // row is picked or Cancel is tapped.
  let downAt = null;
  let touchingList = false;
  list.addEventListener('pointerdown', (e) => {
    downAt = { x: e.clientX, y: e.clientY };
    touchingList = true;
    if (e.pointerType === 'mouse') e.preventDefault();
  });
  list.addEventListener('click', (e) => {
    touchingList = false;
    const li = e.target.closest('li[data-i]');
    if (!li) return;
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 10) return;
    choose(items[Number(li.dataset.i)].country);
    closeSheet();
  });
  cancel.addEventListener('pointerdown', (e) => e.preventDefault());
  cancel.addEventListener('click', () => {
    input.value = '';
    close();
    input.blur();
    closeSheet();
  });
  input.addEventListener('blur', () =>
    setTimeout(() => {
      if (document.activeElement === input) return;
      if (el.classList.contains('sheet') && touchingList) return;
      close();
      closeSheet();
    }, 150),
  );
  const release = () => setTimeout(() => (touchingList = false), 300);
  list.addEventListener('pointerup', release);
  list.addEventListener('pointercancel', release);

  return {
    el,
    input,
    focus: () => input.focus(),
    // Desktop only: on touch devices focusing would pop the keyboard unasked.
    autofocus: () => !isTouch && input.focus(),
    clear: () => ((input.value = ''), close()),
    destroy: closeSheet,
  };
}

/** Rotated arrow pointing along a compass bearing. */
export function arrow(deg) {
  return `<span class="arrow" style="transform: rotate(${Math.round(deg)}deg)" aria-hidden="true">↑</span>`;
}

/** Fact card shown after a country is solved or revealed. */
export function factsCard(c, world, { onCountry, units = 'km', title = null } = {}) {
  const neighbours = c.borders.map((id) => world.get(id)).filter(Boolean);
  const el = h(`
    <div class="card">
      ${title ? `<h3>${esc(title)}</h3>` : ''}
      <div class="facts-head">
        <div class="flag">${c.flag || ''}</div>
        <div>
          <div class="title">${esc(c.name)}</div>
          <div class="sub">${esc(c.official !== c.name ? c.official : '')}</div>
        </div>
      </div>
      <dl class="facts">
        <dt>Capital</dt><dd>${esc(c.capital.join(', ') || 'None')}</dd>
        ${c.population ? `<dt>Population</dt><dd>${formatPopulation(c.population)} <span class="muted small">(2018)</span></dd>` : ''}
        <dt>Region</dt><dd>${esc([c.subregion, c.region].filter(Boolean).join(', '))}</dd>
        <dt>Area</dt><dd>${units === 'mi' ? `${Math.round(c.area * 0.386102).toLocaleString()} sq mi` : `${Math.round(c.area).toLocaleString()} km²`}${c.landlocked ? ' · landlocked' : ''}</dd>
        ${c.languages.length ? `<dt>Languages</dt><dd>${esc(c.languages.slice(0, 4).join(', '))}</dd>` : ''}
        ${c.currencies.length ? `<dt>Currency</dt><dd>${esc(c.currencies.join(', '))}</dd>` : ''}
        <dt>Neighbours</dt>
        <dd>${
          neighbours.length
            ? `<div class="chips">${neighbours.map((n) => `<button class="chip-btn" data-id="${n.id}">${n.flag || ''} ${esc(n.name)}</button>`).join('')}</div>`
            : '<span class="muted">None (island or exclave)</span>'
        }</dd>
      </dl>
    </div>`);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (b && onCountry) onCountry(world.get(b.dataset.id));
  });
  return el;
}

export function distanceText(km, units) {
  return km === 0 ? 'touching' : formatKm(km, units);
}
