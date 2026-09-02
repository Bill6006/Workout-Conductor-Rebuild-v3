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
| **Phase report** | [docs/reports/phase-2.md](./docs/reports/phase-2.md)                  |

## Where the build is

|                            |                                                                                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Current phase**          | Phase 2 — Exercise Catalog, Media, and Conflict Engine                                                                             |
| **Phase state**            | YELLOW — deployed and verified; awaiting your Android review                                                                       |
| **Latest completed phase** | Phase 1 — Product Foundation (GREEN, 2026-09-01)                                                                                   |
| **Branch**                 | `main`                                                                                                                             |
| **Latest commit**          | [commit history](https://github.com/Bill6006/Workout-Conductor-Rebuild-v3/commits/main) — the phase report pins the reviewed build |
| **Latest deployment**      | live — [Pages runs](https://github.com/Bill6006/Workout-Conductor-Rebuild-v3/actions/workflows/pages.yml)                          |
| **Deployed build marker**  | `phase2-<run>-<short sha>`, at the foot of every screen. Read it in the live app; it always names the commit currently deployed.   |
| **Last updated**           | 2026-09-01                                                                                                                         |

## Work in progress

Nothing. Phase 2 is complete and stopped at the review gate. No Phase 3 code has been
written, by design — the gate exists so the next phase starts only after your approval.

## Test totals

Every gate runs locally and again in GitHub Actions. The Pages workflow uploads its
deployment artifact only after all of them pass, so a failing gate leaves the previously
deployed site untouched.

| Gate                            | Result                                          |
| ------------------------------- | ----------------------------------------------- |
| `npm run lint` (ESLint)         | pass — 0 errors, 0 warnings                     |
| `npm run typecheck` (tsc)       | pass — app, node, and Playwright projects       |
| `npm test` (Vitest)             | pass — 1429 tests across 83 files               |
| `npm run build` (Vite)          | pass — ~115 KB gzipped on first paint           |
| `npm run privacy:scan`          | pass — source, lockfile, and bundle             |
| `npm run verify:build`          | pass — 11 of 11 checks                          |
| `npm run test:e2e` (Playwright) | pass — 150 tests on android-360 / 412 / desktop |

## Mobile screenshots

Captured from the real running build, not mockups. Full set in
[docs/screenshots/phase-2/](./docs/screenshots/phase-2/) — 40 files covering all eight
setup steps and all five tabs at 360 px, 412 px, and desktop.

| Screen        | 360 px (Android)                                                                |
| ------------- | ------------------------------------------------------------------------------- |
| Setup, step 1 | [android-360-setup-01.png](./docs/screenshots/phase-2/android-360-setup-01.png) |
| Setup, goals  | [android-360-setup-02.png](./docs/screenshots/phase-2/android-360-setup-02.png) |
| Setup, style  | [android-360-setup-03.png](./docs/screenshots/phase-2/android-360-setup-03.png) |
| Setup, review | [android-360-setup-08.png](./docs/screenshots/phase-2/android-360-setup-08.png) |
| Today         | [android-360-today.png](./docs/screenshots/phase-2/android-360-today.png)       |
| Plan          | [android-360-plan.png](./docs/screenshots/phase-2/android-360-plan.png)         |
| Settings      | [android-360-settings.png](./docs/screenshots/phase-2/android-360-settings.png) |

Combined contact sheet: [preview-sheet.png](./docs/screenshots/phase-2/preview-sheet.png)

## Current known limitations

Scope boundaries, not defects. Phase 2 builds what the workout engine will reason with; the
engine itself is Phase 3.

- **There is still no workout engine.** Start Workout is disabled and says so. The conflict
  and alternatives engines are complete as pure functions, but nothing calls them yet.
- **The workout-length control is still a display.** It becomes the working
  15 / 30 / 45 / Default dropdown in Phase 3, and stays the only workout-length control.
- **No exercise has a real demonstration yet** — 0 of 127. Phase 2 shipped the media
  manifest, the licensing register, and pattern-level placeholder posters. Closing the gap
  needs a decision from you; the options are laid out in the phase report.
- Exercise-preference matching is deliberately conservative: a typed entry that was only
  nearly a match stays as free text rather than being guessed at, and remains visible and
  editable.
- Custom exercises and custom media have schemas but no authoring UI yet.
- Workout and Progress are still Phase 0 placeholders. Progress fills in at Phase 7.

## Next concrete action

Open the live link on your Android phone. Run setup, and try the new exercise picker on the
limits-and-preferences step or in Settings. Then reply with exactly one of
`GREEN - NEXT PHASE`, `YELLOW - FIX: <issue>`, or `RED - STOP`.

Worth a moment while you are in there: the catalog is 127 exercises of coaching judgement.
If you know a lift well, check that its muscles, rep range, and cues read right.

On `GREEN`, Phase 3 begins: hybrid strength and hypertrophy generation, weekly-volume and
recent-exposure logic, the working 15 / 30 / 45 / Default duration dropdown, time estimation,
warm-up planning, smart supersets, optional drop sets and circuits, and the workout
explanation.

---

### How to review

Open the live app on your Android phone, then reply with exactly one of:

- `GREEN - NEXT PHASE` — approved; begin only the next numbered phase
- `YELLOW - FIX: <issue>` — stay in this phase, fix only what you name, redeploy, stop again
- `RED - STOP` — halt; the last working deployment is preserved

A phase is never marked GREEN by anyone but you.
