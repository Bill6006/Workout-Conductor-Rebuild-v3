# Project status

**Workout Conductor** — Adaptive Strength + Hypertrophy

|                  |                                                                       |
| ---------------- | --------------------------------------------------------------------- |
| **Live app**     | https://bill6006.github.io/Workout-Conductor-Rebuild-v3/              |
| **Repository**   | https://github.com/Bill6006/Workout-Conductor-Rebuild-v3              |
| **Actions**      | https://github.com/Bill6006/Workout-Conductor-Rebuild-v3/actions      |
| **Commits**      | https://github.com/Bill6006/Workout-Conductor-Rebuild-v3/commits/main |
| **Master issue** | https://github.com/Bill6006/Workout-Conductor-Rebuild-v3/issues/1     |
| **Milestone**    | https://github.com/Bill6006/Workout-Conductor-Rebuild-v3/milestone/1  |
| **Phase report** | [docs/reports/phase-0.md](./docs/reports/phase-0.md)                  |

## Where the build is

|                            |                                                    |
| -------------------------- | -------------------------------------------------- |
| **Current phase**          | Phase 0 — Repository, Live Pages, and Scaffold     |
| **Phase state**            | YELLOW — awaiting owner review on Android          |
| **Latest completed phase** | None. Phase 0 is the first.                        |
| **Branch**                 | `main`                                             |
| **Latest commit**          | See the commits link above                         |
| **Latest deployment**      | First Pages deployment in progress                 |
| **Deployed build marker**  | Set by the Pages workflow; visible on every screen |
| **Last updated**           | 2026-09-01                                         |

## Work in progress

Nothing. Phase 0 is complete and stopped at the review gate. No Phase 1 code has been
written, by design — the gate exists so the next phase starts only after your approval.

## Test totals

Every gate below runs locally and again in GitHub Actions. The Pages workflow uploads its
deployment artifact only after all of them pass, so a failing gate leaves the previously
deployed site untouched.

| Gate                            | Result                                         |
| ------------------------------- | ---------------------------------------------- |
| `npm run lint` (ESLint)         | pass — 0 errors, 0 warnings                    |
| `npm run typecheck` (tsc)       | pass — app, node, and Playwright specs         |
| `npm test` (Vitest)             | pass — 98 tests across 18 files                |
| `npm run build` (Vite)          | pass — 267.7 KB raw / 86.0 KB gzipped          |
| `npm run privacy:scan`          | pass — 111 source + 1 lockfile + 11 bundle     |
| `npm run verify:build`          | pass — 11 of 11 checks                         |
| `npm run test:e2e` (Playwright) | pass — 51 tests on android-360 / 412 / desktop |

## Mobile screenshots

Captured from the real running build, not mockups. Full set in
[docs/screenshots/phase-0/](./docs/screenshots/phase-0/).

| Tab      | 360 px (Android)                                                                | 412 px (Android)                                                                |
| -------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Today    | [android-360-today.png](./docs/screenshots/phase-0/android-360-today.png)       | [android-412-today.png](./docs/screenshots/phase-0/android-412-today.png)       |
| Workout  | [android-360-workout.png](./docs/screenshots/phase-0/android-360-workout.png)   | [android-412-workout.png](./docs/screenshots/phase-0/android-412-workout.png)   |
| Progress | [android-360-progress.png](./docs/screenshots/phase-0/android-360-progress.png) | [android-412-progress.png](./docs/screenshots/phase-0/android-412-progress.png) |
| Plan     | [android-360-plan.png](./docs/screenshots/phase-0/android-360-plan.png)         | [android-412-plan.png](./docs/screenshots/phase-0/android-412-plan.png)         |
| Settings | [android-360-settings.png](./docs/screenshots/phase-0/android-360-settings.png) | [android-412-settings.png](./docs/screenshots/phase-0/android-412-settings.png) |

Combined contact sheet: [preview-sheet.png](./docs/screenshots/phase-0/preview-sheet.png)

## Current known limitations

These are scope boundaries, not defects. Phase 0 proves the pipeline and the visual
foundation and deliberately implements no training features.

- Every screen is an empty state. Nothing persists, because there is nothing to persist.
- The workout-length control on Today is a static disabled display. It becomes the working
  15 / 30 / 45 / Default dropdown in Phase 3, and it stays the only workout-length control
  in the product.
- No onboarding, profile, IndexedDB layer, exercise catalog, generation engine,
  recalibration, set logger, or analytics exist yet.
- The service worker is configured for prompt-to-update. Registration, activation, and
  offline shell reload are all verified on the live site, but the "New version available"
  prompt itself cannot be exercised until there is a newer deployment to update to. First
  real test is the Phase 1 deploy.
- The mobile report's feature rows are unfilled on purpose — there is no feature to check.

## Next concrete action

Open the live link on your Android phone and review the shell. Then reply with exactly one
of `GREEN - NEXT PHASE`, `YELLOW - FIX: <issue>`, or `RED - STOP`.

On `GREEN`, Phase 1 begins: step-by-step onboarding, profile and goals, equipment and
location profiles, preferences and limitations, editable settings, the IndexedDB durable
data foundation with Zod validation and write/read-back save verification, the
export/import foundation, the Today dashboard, and a clearly labelled synthetic demo
workout preview on the same live link.

---

### How to review

Open the live app on your Android phone, then reply with exactly one of:

- `GREEN - NEXT PHASE` — approved; begin only the next numbered phase
- `YELLOW - FIX: <issue>` — stay in this phase, fix only what you name, redeploy, stop again
- `RED - STOP` — halt; the last working deployment is preserved

A phase is never marked GREEN by anyone but you.
