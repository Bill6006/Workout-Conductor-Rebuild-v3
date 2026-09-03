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
| **Phase report** | [docs/reports/phase-5.md](./docs/reports/phase-5.md)                  |

## Where the build is

|                            |                                                                                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Current phase**          | Phase 5 — Active Workout, Logging, and Superset Experience                                                                         |
| **Phase state**            | YELLOW — deployed and verified; awaiting your Android review                                                                       |
| **Latest completed phase** | Phase 4 — Central Recalibration (GREEN, 2026-09-03)                                                                                |
| **Branch**                 | `main`                                                                                                                             |
| **Latest commit**          | [commit history](https://github.com/Bill6006/Workout-Conductor-Rebuild-v3/commits/main) — the phase report pins the reviewed build |
| **Latest deployment**      | live — [Pages runs](https://github.com/Bill6006/Workout-Conductor-Rebuild-v3/actions/workflows/pages.yml)                          |
| **Deployed build marker**  | `phase5-<run>-<short sha>`, at the foot of every screen. Read it in the live app; it always names the commit currently deployed.   |
| **Last updated**           | 2026-09-01                                                                                                                         |

## Work in progress

Nothing. Phase 5 is complete and stopped at the review gate. No Phase 6 code has been
written, by design — the gate exists so the next phase starts only after your approval.

## Test totals

Every gate runs locally and again in GitHub Actions. The Pages workflow uploads its
deployment artifact only after all of them pass, so a failing gate leaves the previously
deployed site untouched.

| Gate                            | Result                                          |
| ------------------------------- | ----------------------------------------------- |
| `npm run lint` (ESLint)         | pass — 0 errors, 0 warnings                     |
| `npm run typecheck` (tsc)       | pass — app, node, and Playwright projects       |
| `npm test` (Vitest)             | pass — 2007 tests                               |
| `npm run build` (Vite)          | pass — ~97 KB gzipped on first paint            |
| `npm run privacy:scan`          | pass — source, lockfile, and bundle             |
| `npm run verify:build`          | pass — 11 of 11 checks                          |
| `npm run test:e2e` (Playwright) | pass — 200 tests on android-360 / 412 / desktop |

## Mobile screenshots

Captured from the real running build, not mockups. Full set in
[docs/screenshots/phase-5/](./docs/screenshots/phase-5/) — 40 files covering all eight
setup steps and all five tabs at 360 px, 412 px, and desktop.

| Screen        | 360 px (Android)                                                                |
| ------------- | ------------------------------------------------------------------------------- |
| Setup, step 1 | [android-360-setup-01.png](./docs/screenshots/phase-5/android-360-setup-01.png) |
| Setup, goals  | [android-360-setup-02.png](./docs/screenshots/phase-5/android-360-setup-02.png) |
| Setup, style  | [android-360-setup-03.png](./docs/screenshots/phase-5/android-360-setup-03.png) |
| Setup, review | [android-360-setup-08.png](./docs/screenshots/phase-5/android-360-setup-08.png) |
| Today         | [android-360-today.png](./docs/screenshots/phase-5/android-360-today.png)       |
| Plan          | [android-360-plan.png](./docs/screenshots/phase-5/android-360-plan.png)         |
| Settings      | [android-360-settings.png](./docs/screenshots/phase-5/android-360-settings.png) |

Combined contact sheet: [preview-sheet.png](./docs/screenshots/phase-5/preview-sheet.png)

## Current known limitations

- **No progression yet.** Weight targets read as unknown on a first session; the logger
  seeds from your last set on the same exercise, which covers the common case. Phase 6 turns
  logged performance into next targets.
- Per-exercise notes are held for the session but do not yet persist between sessions.
- Warm-up Add/Skip is modelled but has no dedicated control; drop sets are shown but have no
  separate in-set flow.
- Exercise demonstrations are placeholder posters, labelled as such — still 0 of 127 real
  demonstrations, and still an open decision from the
  [Phase 2 report](./docs/reports/phase-2.md#a-decision-you-need-to-make-exercise-demonstrations).
- The Progress tab is still a Phase 0 placeholder. Personal records, weekly volume, and the
  full session summary arrive in Phase 7.

## Next concrete action

**Use it.** Start a workout on your phone, log some sets, tap a completed set to correct it,
and — the one worth testing hardest — close the app mid-session and reopen it. Your sets
should be exactly where you left them.

Then reply with exactly one of `GREEN - NEXT PHASE`, `YELLOW - FIX: <issue>`, or `RED - STOP`.

On `GREEN`, Phase 6 builds the intelligence: the progression engine, readiness and recovery
adjustments, fatigue interpretation, next-target recommendations, the single gold Adaptive
Coach card with its priority arbitration, multi-session strategy, and plateau detection.

---

### How to review

Open the live app on your Android phone, then reply with exactly one of:

- `GREEN - NEXT PHASE` — approved; begin only the next numbered phase
- `YELLOW - FIX: <issue>` — stay in this phase, fix only what you name, redeploy, stop again
- `RED - STOP` — halt; the last working deployment is preserved

A phase is never marked GREEN by anyone but you.
