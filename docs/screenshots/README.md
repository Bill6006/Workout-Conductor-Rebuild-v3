# Screenshots

Screenshots of the real running app, captured per phase and referenced from the phase reports.

## Convention

`scripts/capture-screenshots.mjs` is the source of truth for these names. It writes:

```text
docs/screenshots/<phase>/<profile>-<tab>.png
docs/screenshots/<phase>/preview-sheet.png
```

- `<phase>` — the output directory, `phase-0` by default (`--out` overrides it).
- `<profile>` — one of the three capture profiles the script defines:
  - `android-360` — 360 x 800, DPR 3, mobile
  - `android-412` — 412 x 915, DPR 2.625, mobile
  - `desktop` — 1280 x 900, DPR 1
- `<tab>` — one of the five routes the script visits: `today`, `workout`, `progress`, `plan`,
  `settings`.

That is 15 screenshots per run (3 profiles x 5 tabs), plus `preview-sheet.png`, a contact sheet
the script composes from the five `android-360` shots.

The full set:

```text
docs/screenshots/phase-0/android-360-today.png
docs/screenshots/phase-0/android-360-workout.png
docs/screenshots/phase-0/android-360-progress.png
docs/screenshots/phase-0/android-360-plan.png
docs/screenshots/phase-0/android-360-settings.png
docs/screenshots/phase-0/android-412-today.png
docs/screenshots/phase-0/android-412-workout.png
docs/screenshots/phase-0/android-412-progress.png
docs/screenshots/phase-0/android-412-plan.png
docs/screenshots/phase-0/android-412-settings.png
docs/screenshots/phase-0/desktop-today.png
docs/screenshots/phase-0/desktop-workout.png
docs/screenshots/phase-0/desktop-progress.png
docs/screenshots/phase-0/desktop-plan.png
docs/screenshots/phase-0/desktop-settings.png
docs/screenshots/phase-0/preview-sheet.png
```

All lowercase, hyphen-separated, PNG. There is no zoom profile and no additional state suffix
today; adding either means changing `PROFILES` or `TABS` in the script first, then updating this
list to match.

## Rules

**Real app only.** Every screenshot is captured from the actual running application, through
Playwright (`npm run shots`) or a real device. Mockups, design comps, hand-edited images, and
composites are never committed here. A screenshot in a phase report is evidence that the app
looks like that — the moment one is faked, the whole set stops meaning anything.

**Regenerate only when the visible UI changes.** Screenshots are not refreshed on every commit.
Recapture when a phase changes what a screen looks like, and commit the whole affected set
together so a phase folder is internally consistent.

**No personal data.** Captures use synthetic or blank state. No real training history, no
identifying content, nothing from another product on screen.

## Capturing

The script drives an existing preview server; it does not build or start one. The preview must be
served from the deployed sub-path, because the built asset URLs carry it — `vite preview` resolves
`vite.config.ts` with command `serve`, where `base` falls back to `/`. Without the explicit
`--base` the app never boots and the script fails waiting for the build marker.

```bash
npm run build
npx vite preview --port 4173 --base /Workout-Conductor-Rebuild-v3/
# in a second shell:
npm run shots
```

Options (`node scripts/capture-screenshots.mjs --help`):

- `--base-url <url>` — preview origin including the sub-path
  (default `http://localhost:4173/Workout-Conductor-Rebuild-v3/`)
- `--out <dir>` — output directory (default `docs/screenshots/phase-0`)
- `--viewport` — capture one device screen instead of the full page. Full-page shots paint the
  fixed bottom navigation at its viewport position, part way down a tall screen.

This directory is excluded from Prettier, so image files and their committed paths are left
untouched by formatting.
