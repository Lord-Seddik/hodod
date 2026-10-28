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
    compute.js             solar events → per-madhab prayer timelines → combined rows (cached)
    timeline.js            the current view's phases (two days back → tomorrow) and scheduled alerts
  data/
    cities.js              built-in cities (name, country, coordinates, time zone, method)
    methods.js             official calculation methods (Fajr/Isha angles, official minute offsets)
    rulings.js             ALL fiqh content: each prayer's boundaries and every madhab's ruling, note
                           and best time; how madhabs combine; the wording of each type
  ui/
    now.js                 live "now" gauge
    cards.js               prayer cards (all five, or the selected prayer)
    sky.js                 sun-path canvas strip, ruling rows (one per madhab when several), ticks
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
  compute.test.js          times vs references, ordering for every city, offsets, precaution margin
  madhabs.test.js          per-madhab windows and rulings, majority / safe combining
  cities.test.js           every city's time zone, coordinates, method and solar noon
```

Architecture notes for future changes: [ARCHITECTURE.md](ARCHITECTURE.md).

## Common edits

| To change… | Edit |
|---|---|
| Wording of a boundary or its fiqh note | `src/data/rulings.js` |
| Add a city | append to `src/data/cities.js` (append, don't reorder: saved choices store the index). The picker groups cities by country automatically, and `npm test` checks every entry's time zone, coordinates and method |
| Add / adjust a calculation method | `src/data/methods.js` |
| Default settings or allowed ranges | `DEFAULTS` / `LIMITS` in `src/core/state.js` |
| A prayer's boundaries, each madhab's ruling and best time | `PRAYERS` in `src/data/rulings.js` (the `by` table of each mark) |
| How madhabs combine (majority / safe for all) | `combineMajority()` / `combineSafe()` in `src/data/rulings.js` |
| Times outside the obligatory prayers (sunrise, Duha, istiwa) | `CONTEXT` in `src/data/rulings.js` |
| Colors / fonts / dark theme | `src/styles/tokens.css` |
| Month table columns | `COLUMNS` in `src/ui/month.js` |

## Keyboard

`←` next day/month · `→` previous · `T` today · `M` switch day/month · `D` show/hide details

## Notes

- **Madhab selector:** «الجمهور» (default) colors each time by the agreement or the majority (3 of 4)
  of the four madhabs, in the classic one-verdict look. One madhab shows only its rulings and its own
  boundaries; several show a row per madhab plus a «الآمن للجميع» row (the most cautious verdict).
- **Prayer selector:** zooms the timeline to one prayer's window, from the first entry to the last exit
  among the selected madhabs. Duha/Ishraq and Jumu'ah (Fridays) are optional in settings.
- **Entry times:** the official method's time, never earlier; a madhab's own definition when it is later
  (Hanafi Asr at two shadows, Hanafi Isha at the white twilight).

- Calculations are approximate (about 1–2 minutes). Entries round up to the next minute; exits and
  karaha boundaries round down, as a precaution.
- Alerts fire while the page is open. Turn on **إشعارات النظام** in settings to get them while the tab is in the background.
- Settings are stored in `localStorage` under `hudud-alwaqt-v1`.
