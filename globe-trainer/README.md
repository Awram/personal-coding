# Globe Trainer

A browser game for learning where every country is. It takes the hot-and-cold country guessing idea and adds the things you need to actually learn: drills, hints, facts after each round, and spaced repetition that brings back the countries you get wrong.

![Hunt mode](docs/hunt.png)

## Modes

**Hunt.** Guess the mystery country. Each guess is painted on the globe, hotter the closer it is, with:
- distance from the nearest border (not centre to centre), so neighbours read as "touching"
- a compass arrow pointing towards the target
- a proximity score
- optional hints: region, size, first letter, capital

Play the **Daily** country (same all day, streak tracked) or unlimited **Practice**, which picks targets from the region you choose.

**Find it.** You get a country name and click it on the globe. A miss shows the country you clicked and how far and which way the target is. Three tries, then it's revealed.

**Name it.** The globe flies to a highlighted country and you name it. Typed answers by default; switch on multiple choice in settings for an easier version where the wrong options are nearby countries. "Show neighbours" labels the bordering countries as a clue.

**Progress.** Mastery per skill for the current region, a mastery map coloured on the globe, your weakest countries, and Hunt stats.

After every round you get a fact card: flag, capital, region, area, languages, currency, and clickable neighbours to explore.

## How the training works

Every country has a Leitner box per skill (Find it, Name it, Hunt). Getting it right first time moves it up a box and pushes the next review further out (10 minutes, 1 day, 3 days, a week, 3 weeks). Missing it drops it back to box 1. Practice picks overdue weak countries first, then ones you haven't seen. Progress is saved in your browser's local storage.

## Settings

- Region focus: whole world, Africa, Europe, Asia, Middle East, North and Central America, Caribbean, South America, Oceania
- Include territories and dependencies (Greenland, Puerto Rico, etc.)
- Borders, small-country dots and labels on the globe
- Kilometres or miles

## Play on your phone

The app is deployed to GitHub Pages by `.github/workflows/globe-trainer-pages.yml` on every push to `main` that touches `globe-trainer/`:

**https://awram.github.io/personal-coding/**

Add it to your home screen and it opens full screen like an app and works offline after the first visit:
- **iPhone (Safari):** Share button, then "Add to Home Screen"
- **Android (Chrome):** menu, then "Add to Home screen" or "Install app"

One-time setup in the repo: Settings > Pages > Source: **GitHub Actions**.

## Run it

Requires Node 18+.

```bash
cd globe-trainer
npm install
npm run dev      # local dev server
npm test         # unit tests
npm run build    # static site in dist/, deployable anywhere (relative paths)
```

## Data

Built by `npm run build:data` into `public/data/`:
- Shapes: [world-atlas](https://github.com/topojson/world-atlas) 1:50m (Natural Earth, public domain). Somaliland and Northern Cyprus are merged into Somalia and Cyprus.
- Country facts and alternate names: [world-countries](https://github.com/mledoze/countries) (ODbL).
- The core pool is the 193 UN members plus Vatican City, Palestine, Kosovo and Taiwan. Tuvalu isn't in the 1:50m shapes, so it's drawn as a dot.

## Code map

| File | What it does |
| --- | --- |
| `src/geo.js` | Distances, bearings, heat colours (pure functions) |
| `src/data.js` | Loads shapes and facts, border-to-border distance with caching, region pools |
| `src/globe.js` | Canvas orthographic globe: drag, zoom, pinch, click to pick, fly-to |
| `src/search.js` | Accent-insensitive name matching and autocomplete |
| `src/progress.js` | Stats, daily puzzle, streaks, spaced repetition |
| `src/modes/*` | The four modes |
| `scripts/build-data.mjs` | Generates `public/data/` |
