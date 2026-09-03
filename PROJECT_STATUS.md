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
| **Phase report** | [docs/reports/phase-4.md](./docs/reports/phase-4.md)                  |

## Where the build is

|                            |                                                                                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Current phase**          | Phase 4 — Central Recalibration Engine                                                                                             |
| **Phase state**            | YELLOW — deployed and verified; awaiting your Android review                                                                       |
| **Latest completed phase** | Phase 3 — Workout Generation (GREEN, 2026-09-03)                                                                                   |
| **Branch**                 | `main`                                                                                                                             |
| **Latest commit**          | [commit history](https://github.com/Bill6006/Workout-Conductor-Rebuild-v3/commits/main) — the phase report pins the reviewed build |
| **Latest deployment**      | live — [Pages runs](https://github.com/Bill6006/Workout-Conductor-Rebuild-v3/actions/workflows/pages.yml)                          |
| **Deployed build marker**  | `phase4-<run>-<short sha>`, at the foot of every screen. Read it in the live app; it always names the commit currently deployed.   |
| **Last updated**           | 2026-09-01                                                                                                                         |

## Work in progress

Nothing. Phase 4 is complete and stopped at the review gate. No Phase 5 code has been
written, by design — the gate exists so the next phase starts only after your approval.

## Test totals

Every gate runs locally and again in GitHub Actions. The Pages workflow uploads its
deployment artifact only after all of them pass, so a failing gate leaves the previously
deployed site untouched.

| Gate                            | Result                                          |
| ------------------------------- | ----------------------------------------------- |
| `npm run lint` (ESLint)         | pass — 0 errors, 0 warnings                     |
| `npm run typecheck` (tsc)       | pass — app, node, and Playwright projects       |
| `npm test` (Vitest)             | pass — 1872 tests                               |
| `npm run build` (Vite)          | pass — ~97 KB gzipped on first paint            |
| `npm run privacy:scan`          | pass — source, lockfile, and bundle             |
| `npm run verify:build`          | pass — 11 of 11 checks                          |
| `npm run test:e2e` (Playwright) | pass — 176 tests on android-360 / 412 / desktop |

## Mobile screenshots

Captured from the real running build, not mockups. Full set in
[docs/screenshots/phase-4/](./docs/screenshots/phase-4/) — 40 files covering all eight
setup steps and all five tabs at 360 px, 412 px, and desktop.

| Screen        | 360 px (Android)                                                                |
| ------------- | ------------------------------------------------------------------------------- |
| Setup, step 1 | [android-360-setup-01.png](./docs/screenshots/phase-4/android-360-setup-01.png) |
| Setup, goals  | [android-360-setup-02.png](./docs/screenshots/phase-4/android-360-setup-02.png) |
| Setup, style  | [android-360-setup-03.png](./docs/screenshots/phase-4/android-360-setup-03.png) |
| Setup, review | [android-360-setup-08.png](./docs/screenshots/phase-4/android-360-setup-08.png) |
| Today         | [android-360-today.png](./docs/screenshots/phase-4/android-360-today.png)       |
| Plan          | [android-360-plan.png](./docs/screenshots/phase-4/android-360-plan.png)         |
| Settings      | [android-360-settings.png](./docs/screenshots/phase-4/android-360-settings.png) |

Combined contact sheet: [preview-sheet.png](./docs/screenshots/phase-4/preview-sheet.png)

## Current known limitations

- **You still cannot run a session.** The engine builds one and rebuilds it on demand, but
  nothing logs a set yet. The set logger, rest timer, and mid-session swaps arrive in Phase 5.
- Because nothing can log a set, the completed-work locking rules are proven by tests rather
  than by use. They start protecting real work in Phase 5.
- The calibration overlay is correct but rarely seen — a rebuild takes milliseconds. It
  matters more once Phase 5 recalibrates mid-session.
- Equipment Busy exists in the engine; the affordance to mark something busy arrives with the
  Phase 5 exercise cards.
- **No history, so no progression.** Every weight target reads as unknown, with a reason.
- No exercise has a real demonstration yet (0 of 127). Closing that gap needs a decision from
  you — see the
  [Phase 2 report](./docs/reports/phase-2.md#a-decision-you-need-to-make-exercise-demonstrations).
- Workout and Progress remain Phase 0 placeholders. Progress fills in at Phase 7.

## Next concrete action

Open the live link and change the workout length a few times. A line should appear under the
control saying what actually moved, and the session should match that sentence. Then reply
with exactly one of `GREEN - NEXT PHASE`, `YELLOW - FIX: <issue>`, or `RED - STOP`.

On `GREEN`, Phase 5 builds the part you will actually use in a gym: the active workout
screen, a new one-handed Set Logger, inline editing of completed sets, the rest timer,
exercise demonstrations, Alternatives with one-tap replacement, the combined two-move
superset card, drop-set presentation, warm-up Add/Skip, per-exercise notes, Plate Math, and
pause and resume.

---

### How to review

Open the live app on your Android phone, then reply with exactly one of:

- `GREEN - NEXT PHASE` — approved; begin only the next numbered phase
- `YELLOW - FIX: <issue>` — stay in this phase, fix only what you name, redeploy, stop again
- `RED - STOP` — halt; the last working deployment is preserved

A phase is never marked GREEN by anyone but you.
