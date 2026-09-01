# Phase 0 — Repository, Live Pages, and Scaffold

**Status: YELLOW — submitted for review.**

|              |                                                          |
| ------------ | -------------------------------------------------------- |
| Live app     | https://bill6006.github.io/Workout-Conductor-Rebuild-v3/ |
| Build marker | _pending first deployment_                               |
| Commit       | _pending first deployment_                               |
| Build time   | _pending first deployment_                               |
| Workflow run | _pending first deployment_                               |

## Scope

Stand up the repository, the continuous integration and GitHub Pages deployment path, the
Vite + React 19 + TypeScript scaffold, the PWA shell, and a blank but polished mobile app shell
with five-tab bottom navigation and a visible build marker. Capture the first Android-sized
screenshots from the real running app.

Phase 0 proves the pipeline and the visual foundation. It deliberately builds no product
features.

## Delivered

- Repository, MIT license, ignore rules including the "never commit user data" block.
- Vite + React 19 + TypeScript scaffold with strict compiler settings
  (`noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, `erasableSyntaxOnly`).
- Design-token layer and global CSS: charcoal surfaces, lime accent, type scale, spacing,
  radii, shadows, safe-area and layout metrics.
- Application shell with hash routing and the Today / Workout / Progress / Plan / Settings
  bottom navigation.
- Honest placeholder screens for each tab — empty states, not mock data.
- PWA manifest, icons, and a service worker configured for prompt-to-update
  (`skipWaiting: false`, `clientsClaim: false`).
- On-screen build marker fed by `__BUILD_MARKER__`, `__BUILD_PHASE__`, `__BUILD_COMMIT__`,
  and `__BUILD_TIME__`.
- GitHub Actions workflow running the full verification gate and deploying to Pages.
- Verification scripts: `privacy:scan`, `verify:build`, `shots`.
- Documentation set: architecture note, five engine and data-model design specs, media license
  register, mobile test report template.

## Not in scope

Explicitly not built in this phase, and their absence is not a defect:

- Onboarding, profile, location, or equipment setup.
- IndexedDB layer, Zod schemas, or persistence of any kind.
- Exercise catalog and media.
- Workout generation, duration fitting, volume, or scoring.
- Recalibration, conflict detection, alternatives.
- Set logging, active workout, supersets.
- Progression, recovery model, Adaptive Coach.
- Progress views, plan, personal records, session summary.
- Export, import, backup, or migration.

## Tests

| Gate                            | Result                                     |
| ------------------------------- | ------------------------------------------ |
| `npm run lint`                  | pass — 0 errors, 0 warnings                |
| `npm run typecheck`             | pass — app, node, and e2e projects         |
| `npm test` (Vitest)             | pass — 98 tests, 18 files                  |
| `npm run build`                 | pass — 267.7 KB raw / 86.0 KB gzip         |
| `npm run privacy:scan`          | pass — 111 source + 1 lockfile + 11 bundle |
| `npm run verify:build`          | pass — 11 of 11 checks                     |
| `npm run test:e2e` (Playwright) | pass — 51 tests, 3 projects                |

Mobile matrix: see [mobile-test-report.md](../mobile-test-report.md). All 16 width x zoom
combinations pass — 360 / 375 / 412 / 430 px at 100 / 115 / 130 / 150% — checked on every
route for horizontal overflow, bottom-nav presence, 44 px touch targets, and heading
structure. Feature rows are marked `shell only`, since no feature exists to check.

## Performance

Measured on the production build served from the deployed sub-path, in Chromium at
360x800 with a 4x CPU slowdown and ~1.6 Mbps / 150 ms RTT — a deliberately pessimistic
mid-range Android profile. "Time to interactive" is measured from navigation start to the
build marker being present in the DOM. Target for this phase was under 2 s.

| Metric                                 | Value                                                |
| -------------------------------------- | ---------------------------------------------------- |
| Bundle size (gzipped)                  | 86.0 KB across 4 assets                              |
| Largest chunk                          | assets/index — 197.8 KB raw / 62.7 KB gzip           |
| Time to interactive (mobile emulation) | 1388 ms median of 5 runs                             |
| Lighthouse performance                 | not run — deferred to Phase 8 acceptance             |
| Lighthouse PWA / installable           | not run — manifest and SW verified by `verify:build` |
| Offline reload after first visit       | service worker registers and precaches 14 entries    |

## Screenshots

Captured from the real running build at Android sizes — one device screen per shot, which
is what the phone actually shows. See [docs/screenshots/phase-0/](../screenshots/phase-0/).

16 files: five tabs at 360x800 and 412x915 (Android), five at 1280x900 (desktop), and a
combined contact sheet.

| Tab      | 360 px                                                                      | 412 px                                                                      |
| -------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Today    | [android-360-today.png](../screenshots/phase-0/android-360-today.png)       | [android-412-today.png](../screenshots/phase-0/android-412-today.png)       |
| Workout  | [android-360-workout.png](../screenshots/phase-0/android-360-workout.png)   | [android-412-workout.png](../screenshots/phase-0/android-412-workout.png)   |
| Progress | [android-360-progress.png](../screenshots/phase-0/android-360-progress.png) | [android-412-progress.png](../screenshots/phase-0/android-412-progress.png) |
| Plan     | [android-360-plan.png](../screenshots/phase-0/android-360-plan.png)         | [android-412-plan.png](../screenshots/phase-0/android-412-plan.png)         |
| Settings | [android-360-settings.png](../screenshots/phase-0/android-360-settings.png) | [android-412-settings.png](../screenshots/phase-0/android-412-settings.png) |

Contact sheet: [preview-sheet.png](../screenshots/phase-0/preview-sheet.png)

## Known limitations

- Every screen is a placeholder. Nothing persists, because there is nothing to persist yet.
- The service worker is configured but the update-prompt UI is not exercised until a second
  deployment exists to update to.
- The mobile report's feature rows are unfilled by design.
- The workout-length control on Today is a static disabled display, not a working dropdown.
  It becomes the 15 / 30 / 45 / Default dropdown in Phase 3 and remains the only
  workout-length control in the product.
- Lighthouse has not been run. The manifest, icons, service worker, and offline precache are
  asserted by `verify:build` and the browser smoke test instead; a full Lighthouse and
  install audit belongs to Phase 8 acceptance.

## Review decision

The owner reviews the live app and records one of `GREEN - NEXT PHASE`,
`YELLOW - FIX: <issue>`, or `RED - STOP`. This phase does not advance itself.

**Decision:**

**Reviewed by:**

**Date:**

**Notes:**
