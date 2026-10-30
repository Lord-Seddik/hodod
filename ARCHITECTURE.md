# Architecture

How the parts fit together, and the rules to keep when changing them.

## Data flow

```
data/rulings.js (PRAYERS, CONTEXT)        what each madhab says about each stretch of time
data/methods.js, data/cities.js           official angles/offsets, places
core/state.js (cfg, loc)                  settings and the active location
        │
core/astro.js ─► compute.dayEvents(dt)    raw solar events in epoch ms (one date, cached)
        │
        ▼
compute.build(dt)                         per prayer: marks + each active madhab's slices
        │                                 + the combined row (P.row) + window (P.window)
        ├─► compute.madhabDayRow(m, dates)   one madhab's continuous day: latest-started
        │                                    obligatory prayer, else context (sunrise/Duha/istiwa)
        ├─► compute.primaryDayRow(dates)     the active view's combined day row
        └─► compute.displayRows(dates, key)  what the sun strip draws
                │
timeline.ensureTimeline()                 phases (for the "now" box) and alerts, from primaryDayRow
                │
ui/*  +  app.js                           render; app.js owns view state (date, mode, prayer)
```

Everything in `compute` is cached per `version.n`; `bumpVersion()` (via `changed()` in app.js) clears all caches. Call it after any settings or location change.

## Key concepts

**Views (state.js)**
- `cfg.rules === 'recommended'` → «الجمهور»: all four madhabs, combined by `combineMajority` (agreement, else more than half).
- `cfg.rules === 'advanced'` → the madhabs in `cfg.madhabs`. One madhab: its own types. Several: `combineSafe` (most cautious) for the combined row, plus one row per madhab.
- `activeMadhabs()` and `isAdvanced()` are the only things the rest of the code should ask.

**Simple / detailed (cfg.ui)**
- `isSimple()` (default). The class `ui-simple` on `<html>` (so dialogs follow) hides everything marked `.adv-only` (madhab/prayer selectors, advanced settings) and all descriptive text (see the `.ui-simple` block in `styles/base.css`). Mark new advanced-only UI with `adv-only`.
- Simple keeps the chosen madhab(s) but draws only the combined row (`viewRows` in app.js), always shows all five prayers, and uses each mark's `short` label.

**Marks and rules (rulings.js)**
- A prayer is an ordered list of marks. `mark.by[madhab]` is the ruling *from this mark until the next*: `{ seg, note, fadila }`, `'same'` (previous ruling continues), or `fn(ctx, madhab)`.
- `seg` types: `fadila ok jawaz karaha darura` are VALID (the prayer is on time); `prev` (not entered), `out` (ended), `nahy`/`free`/`idle` (context). `khilaf` and `kd` only come out of combining.
- `fadila: true` → the whole stretch is the best time; `'early'` → its first `cfg.fadilaMin` minutes.
- `when(ctx)` includes a mark conditionally (a madhab is selected, Friday, white twilight later than the official Isha …).
- Every madhab must be covered at every mark (`by[m]` or `by.all`); `tests/madhabs.test.js` checks this.

**Slices and windows (compute.js)**
- Each madhab's slices come from runs of the same rule object between marks; `'same'` returns the identical object so runs merge, and an `'early'` best time is not restarted by a quiet mark.
- `P.window`: advanced → from the first madhab's entry to the last madhab's exit; recommended → the span of the majority row.
- Display per mark: `mark.type` (combined), `mark.rulings` (per madhab at that moment), `mark.quiet` (changes nothing for the view → hidden), `mark.exit`, `mark.context`.

**Entry times**
- Official method time, never earlier. A madhab's own definition applies when later: `asrAt2(m)` (Hanafi two shadows), `whiteIsha(m)` (Hanafi white twilight, `e.ishaWhite = max(official, 18°)`).

**Rounding (compute.adjust)**
- Entries round up, everything else down, plus the precaution margin (`cfg.iht`). A mark rounds up if any active madhab enters there. This leaves ~1 minute gaps between one prayer's exit and the next one's entry; the "now" box treats them as a gap.

**Current prayer (app.js)**
- `view.autoPrayer` follows `currentPrayerKey()`; picking another prayer turns it off, picking the current one turns it back on.
- After midnight the current prayer is the previous night's Isha: `prayerBuild()` returns yesterday's build when its window contains now.

## Rules to keep

- **City list is append-only.** Saved settings store `cityIdx`; reordering breaks users' saved city. New cities go at the end of `data/cities.js`; the picker groups by country itself.
- **Settings migrations** live in `state.js` (load). Saved values from older versions are mapped there (e.g. v1 `asr:'std'` → `'auto'`). Keep `DEFAULTS.v` and add a mapping when a default's meaning changes; add new keys to `DEFAULTS` and numeric ones to `LIMITS`.
- **Fiqh text and rules live only in `rulings.js`.** UI code shows `label`, `short`, `sub`, `note`; it never hard-codes a ruling.
- **Official offsets** (`methods.js` `adjust`) shift published entry/exit times only; istiwa, ishraq, isfar and the high-latitude night stay astronomical.
- **Do not narrate rulings as certain**: estimated values (`humra`, `stars`, `maghribMin`, `fadilaMin`, Duha's quarter-day) are labelled اجتهادي / تقدير in their `sub`.

## Tests

`npm test` runs `tests/`:
- `compute.test.js`: reference times (Makkah), Ramadan Isha, ordering for every city at solstices/equinoxes, official offsets, precaution margin, day-row continuity.
- `madhabs.test.js`: rule coverage, combining, per-madhab windows (Hanafi Asr/Isha, Maliki necessity times, Shafi'i redness/Friday, Hanbali Jumu'ah), safe rows.
- `cities.test.js`: every city's time zone, coordinates, method, and a plausible solar noon (catches wrong sign or zone).

Tests set `cfg` directly and call `applyLocation()` + `bumpVersion()`; there is no DOM in tests.
