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
| **Phase report** | [docs/reports/phase-1.md](./docs/reports/phase-1.md)                  |

## Where the build is

|                            |                                                                                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Current phase**          | Phase 1 — Product Foundation and First Useful Live Preview                                                                         |
| **Phase state**            | YELLOW — deployed and verified; awaiting your Android review                                                                       |
| **Latest completed phase** | Phase 0 — Repository, Live Pages, and Scaffold (GREEN, 2026-09-01)                                                                 |
| **Branch**                 | `main`                                                                                                                             |
| **Latest commit**          | [commit history](https://github.com/Bill6006/Workout-Conductor-Rebuild-v3/commits/main) — the phase report pins the reviewed build |
| **Latest deployment**      | live — [Pages runs](https://github.com/Bill6006/Workout-Conductor-Rebuild-v3/actions/workflows/pages.yml)                          |
| **Deployed build marker**  | `phase1-<run>-<short sha>`, at the foot of every screen. Read it in the live app; it always names the commit currently deployed.   |
| **Last updated**           | 2026-09-01                                                                                                                         |

## Work in progress

Nothing. Phase 1 is complete and stopped at the review gate. No Phase 2 code has been
written, by design — the gate exists so the next phase starts only after your approval.

## Test totals

Every gate runs locally and again in GitHub Actions. The Pages workflow uploads its
deployment artifact only after all of them pass, so a failing gate leaves the previously
deployed site untouched.

| Gate                            | Result                                          |
| ------------------------------- | ----------------------------------------------- |
| `npm run lint` (ESLint)         | pass — 0 errors, 0 warnings                     |
| `npm run typecheck` (tsc)       | pass — app, node, and Playwright projects       |
| `npm test` (Vitest)             | pass — 606 tests across 47 files                |
| `npm run build` (Vite)          | pass — ~114 KB gzipped on first paint           |
| `npm run privacy:scan`          | pass — 232 source + 1 lockfile + bundle         |
| `npm run verify:build`          | pass — 11 of 11 checks                          |
| `npm run test:e2e` (Playwright) | pass — 147 tests on android-360 / 412 / desktop |

## Mobile screenshots

Captured from the real running build, not mockups. Full set in
[docs/screenshots/phase-1/](./docs/screenshots/phase-1/) — 40 files covering all eight
setup steps and all five tabs at 360 px, 412 px, and desktop.

| Screen        | 360 px (Android)                                                                |
| ------------- | ------------------------------------------------------------------------------- |
| Setup, step 1 | [android-360-setup-01.png](./docs/screenshots/phase-1/android-360-setup-01.png) |
| Setup, goals  | [android-360-setup-02.png](./docs/screenshots/phase-1/android-360-setup-02.png) |
| Setup, style  | [android-360-setup-03.png](./docs/screenshots/phase-1/android-360-setup-03.png) |
| Setup, review | [android-360-setup-08.png](./docs/screenshots/phase-1/android-360-setup-08.png) |
| Today         | [android-360-today.png](./docs/screenshots/phase-1/android-360-today.png)       |
| Plan          | [android-360-plan.png](./docs/screenshots/phase-1/android-360-plan.png)         |
| Settings      | [android-360-settings.png](./docs/screenshots/phase-1/android-360-settings.png) |

Combined contact sheet: [preview-sheet.png](./docs/screenshots/phase-1/preview-sheet.png)

## Current known limitations

Scope boundaries, not defects. Phase 1 builds the product foundation; the training
intelligence arrives later.

- **There is no workout engine yet.** Start Workout is disabled and says so. Real sessions
  are generated in Phase 3.
- **The workout-length control is a display, not a dropdown.** It shows your default
  duration and is deliberately inert until Phase 3, when it becomes the working
  15 / 30 / 45 / Default control. It stays the only workout-length control in the product.
- **The session shown on Today is a labelled demo.** It is a static, hand-written sample
  marked as a demo in four places. It is never saved, never counted as training, and is
  deleted when the real engine lands.
- **Exercise preferences are free text.** Phase 2 brings the exercise catalog and makes
  them catalog-backed.
- Workout and Progress remain Phase 0 placeholders. Progress fills in at Phase 7.
- Export and import cover the profile. Full backup and exact restore of history, custom
  content, and notes is Phase 8.

## Next concrete action

Open the live link on your Android phone, run through setup, then reply with exactly one of
`GREEN - NEXT PHASE`, `YELLOW - FIX: <issue>`, or `RED - STOP`.

On `GREEN`, Phase 2 begins: the structured exercise catalog, muscle model, movement
patterns, equipment model, limitation and joint-stress tags, progression families, conflict
validation, the alternative-ranking foundation, the production-media manifest and licence
register, and the custom exercise and custom-media schemas.

---

### How to review

Open the live app on your Android phone, then reply with exactly one of:

- `GREEN - NEXT PHASE` — approved; begin only the next numbered phase
- `YELLOW - FIX: <issue>` — stay in this phase, fix only what you name, redeploy, stop again
- `RED - STOP` — halt; the last working deployment is preserved

A phase is never marked GREEN by anyone but you.
