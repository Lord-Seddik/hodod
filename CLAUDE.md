# حدود الوقت — notes for Claude

Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing calculation, rulings or view logic.

- Commands: `npm run dev` (port 5173), `npm test`, `npm run build`. Run `npm test` after any change in `src/core` or `src/data`.
- UI text is Arabic (RTL); code, comments and commit messages are English.
- Fiqh content and per-madhab rules: only in `src/data/rulings.js`. Flag new or changed rulings to the user for scholarly review instead of presenting them as settled.
- `src/data/cities.js` is append-only (saved settings store the index).
- Settings changes: add to `DEFAULTS`/`LIMITS` in `src/core/state.js`, and a migration there if an existing default changes meaning.
- Deployed as a static site from `main` (Render: hodod.onrender.com); pushing `main` deploys.
