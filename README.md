# حدود الوقت — Hudud al-Waqt

Prayer-time calendar that shows the **boundaries inside each prayer's time**:
the chosen time (اختيار), disputed zones (خلاف), disliked/necessity time (كراهة/ضرورة), and exit (خروج).
It also has a live countdown, a sun-path strip, a month table with CSV export, and in-page alerts.

Plain JavaScript (ES modules) + CSS, built with [Vite](https://vite.dev). No framework, no runtime dependencies.

## Run

```bash
npm install
npm run dev       # http://localhost:5173
npm test          # unit tests for the calculations (Vitest)
npm run build     # static site in dist/ (works from any folder or static host)
npm run preview   # serve dist/ locally
```

## Project layout

```
index.html                 page markup (header, gauge, views, dialogs)
public/
  icon.svg                 app icon / favicon
  manifest.webmanifest     install-as-app metadata
  sw.js                    offline cache + notification clicks (production only)
src/
  main.js                  entry: loads styles, starts the app, registers the service worker
  app.js                   view state, render orchestration, navigation, timers
  core/
    astro.js               solar position math (declination, equation of time, sun altitude)
    state.js               settings (defaults, limits, localStorage) and the active location
    time.js                time-zone aware formatting, Hijri/Gregorian dates, durations
    compute.js             solar events → rounded prayer boundaries for one date (cached)
    timeline.js            yesterday→tomorrow phases and scheduled alerts
  data/
    cities.js              built-in cities (name, country, coordinates, time zone, method)
    methods.js             official calculation methods (Fajr/Isha angles)
    rulings.js             ALL boundary wording: labels, sub-lines, fiqh descriptions
  ui/
    now.js                 live "now" gauge
    cards.js               five prayer cards
    sky.js                 sun-path canvas strip, bands, ticks
    month.js               month table + CSV
    alerts.js              sound, toasts, system notifications, upcoming list
    location.js            location dialog (search, GPS, custom coordinates)
    settings.js            settings dialog binding + theme
    wake.js                keep-screen-on toggle
    toast.js, dom.js       small helpers
  styles/
    tokens.css             colors, fonts, light/dark themes  ← start here to restyle
    base.css, components.css, header.css, now.css, day.css, month.css, alerts.css, dialogs.css
tests/
  compute.test.js          sanity checks for times, ordering, high latitudes, precaution margin
```

## Common edits

| To change… | Edit |
|---|---|
| Wording of a boundary or its fiqh note | `src/data/rulings.js` |
| Add a city | append to `src/data/cities.js` (append, don't reorder: saved choices store the index) |
| Add / adjust a calculation method | `src/data/methods.js` |
| Default settings or allowed ranges | `DEFAULTS` / `LIMITS` in `src/core/state.js` |
| Which boundaries exist and their type/color | `computeBuild()` in `src/core/compute.js` |
| Colors / fonts / dark theme | `src/styles/tokens.css` |
| Month table columns | `COLUMNS` in `src/ui/month.js` |

## Keyboard

`←` next day/month · `→` previous · `T` today · `M` switch day/month

## Notes

- Calculations are approximate (about 1–2 minutes). Entries round up to the next minute; exits and
  karaha boundaries round down, as a precaution.
- Alerts fire while the page is open. Turn on **إشعارات النظام** in settings to get them while the tab is in the background.
- Settings are stored in `localStorage` under `hudud-alwaqt-v1`.
