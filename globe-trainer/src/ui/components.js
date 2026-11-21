import { formatKm } from '../geo.js';

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/**
 * Text input with a country suggestion list.
 * onSubmit(country | null, rawText) fires on Enter or when a suggestion is chosen.
 */
export function autocomplete({ index, placeholder = 'Type a country…', filter = null, onSubmit }) {
  const el = h(`
    <div class="ac">
      <input type="text" autocomplete="off" autocapitalize="off" spellcheck="false"
        role="combobox" aria-expanded="false" aria-autocomplete="list" placeholder="${esc(placeholder)}" />
      <ul role="listbox" hidden></ul>
    </div>`);
  const input = el.querySelector('input');
  const list = el.querySelector('ul');
  let items = [];
  let active = -1;

  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    active = -1;
  };
  const render = () => {
    items = index.suggest(input.value, 8, filter);
    if (!items.length || !input.value.trim()) return close();
    list.innerHTML = items
      .map(
        (it, i) => `<li role="option" data-i="${i}" aria-selected="${i === active}">
          <span>${esc(it.country.name)}</span>
          ${it.label !== it.country.name ? `<span class="alias">${esc(it.label)}</span>` : ''}
        </li>`,
      )
      .join('');
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };
  const choose = (country) => {
    close();
    input.value = '';
    onSubmit(country, '');
  };

  input.addEventListener('input', () => {
    active = -1;
    render();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (list.hidden) return;
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
      if (items.length === 1) return choose(items[0].country);
      if (text.trim()) onSubmit(null, text);
    } else if (e.key === 'Escape') {
      close();
    }
  });
  list.addEventListener('pointerdown', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    e.preventDefault();
    choose(items[Number(li.dataset.i)].country);
  });
  input.addEventListener('blur', () => setTimeout(close, 100));

  return { el, input, focus: () => input.focus(), clear: () => ((input.value = ''), close()) };
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
