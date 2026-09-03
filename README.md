# Workout Conductor

**Adaptive Strength + Hypertrophy**

Workout Conductor is an intelligent, local-first workout conductor for hybrid strength and
hypertrophy training. It builds each session around the time you actually have, the place you
are training, the equipment in front of you, how recovered you are, and how your recent sets
have gone — and it rebuilds that session mid-workout when any of those change. It runs entirely
in your browser, works offline, and installs to a phone home screen as a PWA.

## Links

- **Live app** — https://bill6006.github.io/Workout-Conductor-Rebuild-v3/
- **Repository** — https://github.com/Bill6006/Workout-Conductor-Rebuild-v3
- **Build and deploy runs** —
  https://github.com/Bill6006/Workout-Conductor-Rebuild-v3/actions
- **Live status board** — [PROJECT_STATUS.md](./PROJECT_STATUS.md)

## Status

**Phase 4 — Central Recalibration Engine (awaiting review).**

What exists today is a real early product: an eight-step setup, a durable local profile in
IndexedDB with Zod validation and a verified write / read-back / compare save path, fully
editable settings, location and equipment profiles, profile export and import with a preview
before anything is applied, and a Today dashboard driven by your own answers.

Phase 2 added the material the coach will reason with: a 127-exercise catalog with full
structured metadata, a muscle and movement-pattern vocabulary, a conflict engine, and the
alternative-ranking foundation. Exercise preferences are now picked from that catalog rather
than typed.

Phase 3 added the engine. Today now builds a real session for your goals, equipment,
location, and the time you have, and the one workout-length control works — choosing
15 / 30 / 45 / Default rebuilds the session for that time rather than trimming a longer one.

Phase 4 added the recalibration engine behind that control: changing the length goes through
one engine that decides what may change, protects anything already logged, and tells you what
it did.

What does not exist yet is running the session. There is no set logger and no rest timer, so Start
Workout is disabled and says so; the session shown on Today is a static, clearly labelled
sample that is never saved and never counted as training. The workout-length control shows
your default duration but is deliberately inert until Phase 3, when it becomes the working
15 / 30 / 45 / Default dropdown — and it stays the only workout-length control in the product.
Workout and Progress remain honest empty states.

## Privacy and data

Workout Conductor is local-first, and that is a hard architectural constraint rather than a
default that can be relaxed later.

- Everything runs in your browser. There is no backend and no server-side account.
- Durable workout history lives in the browser's IndexedDB, on your device.
- `localStorage` is used only for small settings and active-session metadata.
- Nothing is uploaded. There is no sync, no remote API, and no cloud storage.
- There is no analytics, no telemetry, no crash reporting, and no third-party tracking.
- There are no accounts, no sign-in, and no email addresses anywhere in the product.
- **No real user data may ever be committed to this repository.** Fixtures, test data, and
  screenshots must be synthetic or blank. `.gitignore` blocks the obvious export shapes and
  `npm run privacy:scan` is part of `npm run verify`.

Because the data is local, it is also yours to lose: clearing site data removes it. Phase 8
covers export, import, and restore so a device change is not a data loss event.

## Tech stack

- **Vite** — build tool and dev server
- **React 19** — UI layer
- **TypeScript** — strict mode, including `noUnusedLocals`, `verbatimModuleSyntax`,
  and `erasableSyntaxOnly`
- **Modular CSS** with a design-token layer — no CSS framework, no raw hex in components
- **IndexedDB** (via `idb`) — durable workout history and catalog data
- **localStorage** — small settings and active-session metadata only
- **Zod** — runtime validation at every storage and import boundary
- **Vitest** — unit tests, primarily for the pure engines
- **Playwright** — browser and mobile-viewport tests, and screenshot capture
- **vite-plugin-pwa** — manifest, service worker, offline shell, prompt-to-update
- **ESLint** and **Prettier** — linting and formatting
- **GitHub Actions** — build, verify, and deploy
- **GitHub Pages** — hosting

## Getting started

Requires Node 20.19 or newer.

```bash
npm install          # install dependencies
npm run dev          # start the dev server
npm run verify       # the full local gate: lint, types, tests, build, privacy, build check
npm run test:e2e     # Playwright browser + mobile-viewport tests
```

`npm run verify` is the gate that must be green before any phase is submitted for review. Run it
before pushing; CI runs the same commands and a red CI run must never be papered over.

## Scripts

| Script                 | What it does                                                                 |
| ---------------------- | ---------------------------------------------------------------------------- |
| `npm run dev`          | Vite dev server with hot module replacement                                  |
| `npm run build`        | Type-check the project references, build to `dist/`, then run the post-build |
| `npm run preview`      | Serve the production build locally                                           |
| `npm run lint`         | ESLint across the repository                                                 |
| `npm run lint:fix`     | ESLint with autofix                                                          |
| `npm run format`       | Prettier write                                                               |
| `npm run format:check` | Prettier check, no writes                                                    |
| `npm run typecheck`    | `tsc -b --force` across all project references                               |
| `npm test`             | Vitest, single run                                                           |
| `npm run test:watch`   | Vitest in watch mode                                                         |
| `npm run test:e2e`     | Playwright end-to-end and mobile-viewport tests                              |
| `npm run privacy:scan` | Fails the build if anything resembling personal data is present in the repo  |
| `npm run verify:build` | Asserts the built output is deployable: base path, marker, manifest, SW      |
| `npm run shots`        | Captures the Android-sized screenshots into `docs/screenshots/`              |
| `npm run verify`       | lint → typecheck → test → build → privacy:scan → verify:build                |

## Roadmap

Nine phases. Each one ends at a review gate.

- [x] **Phase 0 — Repository, Live Pages, and Scaffold** — GREEN, 2026-09-01
- [x] **Phase 1 — Product Foundation and First Useful Live Preview** — GREEN, 2026-09-01
- [x] **Phase 2 — Exercise Catalog, Media, and Conflict Engine** — GREEN, 2026-09-02
- [x] **Phase 3 — Workout Generation and Duration Engine** — GREEN, 2026-09-03
- [~] **Phase 4 — Central Recalibration Engine** — in review
- [ ] **Phase 5 — Active Workout, Logging, and Superset Experience**
- [ ] **Phase 6 — Adaptive Coach, Progression, Strategy, and Recovery**
- [ ] **Phase 7 — Progress, Plan, Coverage, PRs, and Session Summary**
- [ ] **Phase 8 — Data Safety, Optional Migration, PWA, Polish, and Acceptance**

Design notes for the engines are written ahead of their phases so that later work cannot
quietly drift from the agreed contract:

- [Architecture](./docs/architecture.md)
- [Workout engine](./docs/workout-engine.md)
- [Recalibration engine](./docs/recalibration-engine.md)
- [Conflict engine](./docs/conflict-engine.md)
- [Progression engine](./docs/progression-engine.md)
- [Data model](./docs/data-model.md)
- [Media license register](./docs/media-license-register.md)
- [Mobile test report](./docs/mobile-test-report.md)

## Product decisions that are locked

These are settled. A later phase that wants to revisit one must raise it as a decision, not
implement around it.

**Workout length is exactly one dropdown.** The options are 15 min, 30 min, 45 min, and Default
time. There are no Full / Lazy / Short / Density / Recovery workout modes, and there is no second
or competing start button anywhere in the product. One control, one start.

**Recovery, fatigue, readiness, and time pressure influence recalibration.** They never spawn a
parallel workout-mode system. If the app knows you are under-recovered, that knowledge changes
what recalibration produces — it does not add a "recovery workout" button next to the normal one.

**One engine per responsibility.** Generation, recalibration, conflicts, alternatives,
progression, coaching, storage, and media each have exactly one owner. No feature may grow a
private second copy of a rule that already lives in an engine.

**One gold Adaptive Coach surface, with at most one action.** The coach speaks in a single place,
carries a single recommendation, and offers at most one thing to press. Advice scattered across
screens is a bug.

**Media must be original or verifiably licensed for redistribution.** Scraping images or video
from Fitbod or any other commercial fitness app is prohibited, as is hotlinking. Every committed
asset needs a row in the [media license register](./docs/media-license-register.md).

## Phase review gate

No phase marks itself complete. Every phase ends **YELLOW** — built, verified, deployed, and
submitted — and stays there until the owner reviews the live app and responds with one of:

- `GREEN - NEXT PHASE` — accepted; the next phase may start.
- `YELLOW - FIX: <issue>` — specific fixes required; the phase stays open and returns for review.
- `RED - STOP` — stop work and escalate.

An agent may not promote its own phase to GREEN, and a phase report may not be written as though
review has already happened. Phase reports live in [`docs/reports/`](./docs/reports/).

## License

MIT. See [LICENSE](./LICENSE).
