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
| **Phase report** | [docs/reports/phase-3.md](./docs/reports/phase-3.md)                  |

## Where the build is

|                            |                                                                                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Current phase**          | Phase 3 — Workout Generation and Duration Engine                                                                                   |
| **Phase state**            | YELLOW — deployed and verified; awaiting your Android review                                                                       |
| **Latest completed phase** | Phase 2 — Exercise Catalog and Engines (GREEN, 2026-09-02)                                                                         |
| **Branch**                 | `main`                                                                                                                             |
| **Latest commit**          | [commit history](https://github.com/Bill6006/Workout-Conductor-Rebuild-v3/commits/main) — the phase report pins the reviewed build |
| **Latest deployment**      | live — [Pages runs](https://github.com/Bill6006/Workout-Conductor-Rebuild-v3/actions/workflows/pages.yml)                          |
| **Deployed build marker**  | `phase3-<run>-<short sha>`, at the foot of every screen. Read it in the live app; it always names the commit currently deployed.   |
| **Last updated**           | 2026-09-01                                                                                                                         |

## Work in progress

Nothing. Phase 3 is complete and stopped at the review gate. No Phase 4 code has been
written, by design — the gate exists so the next phase starts only after your approval.

## Test totals

Every gate runs locally and again in GitHub Actions. The Pages workflow uploads its
deployment artifact only after all of them pass, so a failing gate leaves the previously
deployed site untouched.

| Gate                            | Result                                          |
| ------------------------------- | ----------------------------------------------- |
| `npm run lint` (ESLint)         | pass — 0 errors, 0 warnings                     |
| `npm run typecheck` (tsc)       | pass — app, node, and Playwright projects       |
| `npm test` (Vitest)             | pass — 1849 tests across 100 files              |
| `npm run build` (Vite)          | pass — ~95 KB gzipped on first paint            |
| `npm run privacy:scan`          | pass — source, lockfile, and bundle             |
| `npm run verify:build`          | pass — 11 of 11 checks                          |
| `npm run test:e2e` (Playwright) | pass — 158 tests on android-360 / 412 / desktop |

## Mobile screenshots

Captured from the real running build, not mockups. Full set in
[docs/screenshots/phase-3/](./docs/screenshots/phase-3/) — 40 files covering all eight
setup steps and all five tabs at 360 px, 412 px, and desktop.

| Screen        | 360 px (Android)                                                                |
| ------------- | ------------------------------------------------------------------------------- |
| Setup, step 1 | [android-360-setup-01.png](./docs/screenshots/phase-3/android-360-setup-01.png) |
| Setup, goals  | [android-360-setup-02.png](./docs/screenshots/phase-3/android-360-setup-02.png) |
| Setup, style  | [android-360-setup-03.png](./docs/screenshots/phase-3/android-360-setup-03.png) |
| Setup, review | [android-360-setup-08.png](./docs/screenshots/phase-3/android-360-setup-08.png) |
| Today         | [android-360-today.png](./docs/screenshots/phase-3/android-360-today.png)       |
| Plan          | [android-360-plan.png](./docs/screenshots/phase-3/android-360-plan.png)         |
| Settings      | [android-360-settings.png](./docs/screenshots/phase-3/android-360-settings.png) |

Combined contact sheet: [preview-sheet.png](./docs/screenshots/phase-3/preview-sheet.png)

## Current known limitations

- **You cannot run a session yet.** The engine builds one; Start Workout is disabled and
  says so. The set logger, rest timer, and mid-session swaps arrive in Phase 5.
- **No history, so no progression.** Every weight target reads as unknown, with a reason.
  Phase 6 turns logged performance into next targets.
- Circuits are modelled but never proposed — the rule needs fatigue data from Phase 6.
- Readiness and recovery are accepted as inputs; nothing supplies them yet.
- Warm-ups are planned and flagged, but not yet ramped per exercise.
- No exercise has a real demonstration yet (0 of 127). The manifest, licence register, and
  placeholder posters exist; closing the gap needs a decision from you — see the
  [Phase 2 report](./docs/reports/phase-2.md#a-decision-you-need-to-make-exercise-demonstrations).
- Workout and Progress remain Phase 0 placeholders. Progress fills in at Phase 7.

## Next concrete action

Open the live link on your phone and change the workout length. The four options should each
look like a sensible use of that time rather than one session with rows removed. Then reply
with exactly one of `GREEN - NEXT PHASE`, `YELLOW - FIX: <issue>`, or `RED - STOP`.

This is the first gate where the _training_ is yours to judge rather than the plumbing: are
the rep ranges, rests, and exercise choices ones you would actually run?

On `GREEN`, Phase 4 builds the central Recalibration Engine: the trigger registry, the
calibration overlay, partial recalibration, completed-work locking, failure rollback, the
change summary, location and equipment recalibration, session-only Equipment Busy, and pain
handling.

---

### How to review

Open the live app on your Android phone, then reply with exactly one of:

- `GREEN - NEXT PHASE` — approved; begin only the next numbered phase
- `YELLOW - FIX: <issue>` — stay in this phase, fix only what you name, redeploy, stop again
- `RED - STOP` — halt; the last working deployment is preserved

A phase is never marked GREEN by anyone but you.
