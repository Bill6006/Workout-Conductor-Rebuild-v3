# Architecture

How Workout Conductor is put together, why it is put together that way, and what is
deliberately impossible in it.

This document is written ahead of most of the code. It describes the shape the project has
committed to, so that later phases have something to be measured against. The **Current status**
section at the end is the honest account of what exists today.

## The local-first constraint

Workout Conductor runs entirely on the user's device. This is the first decision and everything
else follows from it.

What that gives us: the app works in a basement gym with no signal, it starts instantly, there is
no account to create before the first workout, and the user's training history is not an asset
sitting on someone else's server.

What it forbids, permanently:

- **No backend.** No API server, no serverless functions, no database we operate.
- **No network calls at runtime.** The app fetches its own static assets and nothing else. A
  recalibration must never wait on a request; see the performance targets below.
- **No analytics or telemetry.** Not usage counts, not error reporting, not "anonymous" pings.
- **No accounts, no sign-in, no email.** There is nothing to log into.
- **No cloud sync.** Multi-device continuity, if it ever arrives, arrives as explicit
  user-initiated export and import, not as background sync.
- **No third-party embeds.** No hotlinked media, no external fonts fetched at runtime, no
  script tags pointing off-origin.

The consequences are real and we accept them. Data lives in one browser profile on one device.
Clearing site data destroys it. That is why Phase 8 treats export, import, and restore as a
first-class feature rather than a nicety, and why every critical write is read back and verified
rather than assumed.

The constraint is also a testable property, not a slogan. `npm run privacy:scan` fails the build
when repository content looks like personal data, and the absence of any HTTP client dependency
is itself a check: if a phase needs `fetch`, that is a design conversation, not an implementation
detail.

## Source layout

```text
src/
  app/        application shell: routing, providers, layout, navigation, error boundary
  core/       framework-free primitives: types, schemas, units, time, ids, result helpers
  engine/     pure deterministic logic: generation, recalibration, conflicts, progression, …
  catalog/    exercise data, metadata, media manifest, tagging
  features/   user-facing feature modules: today, workout, progress, plan, settings
  components/ shared presentational components with no feature knowledge
  styles/     design tokens and global CSS
  test/       test setup and shared fixtures
tests/
  e2e/        Playwright specs, including the mobile-viewport matrix
```

The dependency direction is one-way and enforced by review:

```text
components ─┐
            ├─→ features ─→ engine ─→ core
catalog ────┘                  ↑
                            (catalog)
```

- `core` depends on nothing in the project.
- `engine` depends on `core` and `catalog`. It never imports React, never touches `window`,
  `document`, `localStorage`, `indexedDB`, `Date.now()`, or `Math.random()`.
- `features` compose engines and components. They own React state and side effects.
- `components` know about tokens and props, never about workouts.
- `app` wires the shell together and owns nothing domain-specific.

An import from `engine` into `features` is normal. An import from `features` into `engine` is a
defect.

## Why the engines are pure and live outside React

Every rule that decides _what the workout should be_ lives in `src/engine/` as a pure function:
inputs in, a new value out, no mutation of the inputs, no observation of the outside world.

The reasons are practical.

**Determinism makes the product debuggable.** A user says "it dropped my last two sets when I
changed the time". If generation is pure, that complaint reduces to a fixture: the same request
plus the same catalog plus the same seed produces the same session, on any machine, forever. If
the logic lived inside a component and read the clock, the same complaint would be a ghost hunt.

**Testability without a DOM.** Vitest can exercise the entire decision surface of the app at unit
speed. Thousands of generation and recalibration cases cost seconds, and they run on every commit.
A rendering test cannot cover that space and should not try.

**Time and randomness are inputs, not ambient facts.** Anything that would otherwise be
non-deterministic — the current time, a shuffle seed — is passed in explicitly. Tests pin them;
the app supplies them at the boundary.

**React stays a rendering concern.** Components ask the engine what to show and report what the
user did. They do not hold rules. When a hook starts to contain a policy decision, that policy
belongs in an engine.

## Engine ownership boundaries

One engine per responsibility. These boundaries are the main defence against the product growing
two subtly different copies of the same rule.

| Engine            | Owns                                                                   | Phase |
| ----------------- | ---------------------------------------------------------------------- | ----- |
| **Generation**    | Building a whole session from a request: selection, order, sets, reps  | 3     |
| **Duration**      | Fitting a session to 15 / 30 / 45 / Default; time cost of every block  | 3     |
| **Volume**        | Weekly and per-session volume targets by muscle group and role         | 3     |
| **Scoring**       | Ranking candidate exercises against the request                        | 3     |
| **Recalibration** | Rebuilding the _remaining_ workout when something changes mid-session  | 4     |
| **Conflicts**     | Detecting structural problems in a proposed session                    | 2     |
| **Alternatives**  | Offering valid swaps for one exercise, preserving role and progression | 2 / 5 |
| **Progression**   | Deciding the next prescription from logged performance                 | 6     |
| **Recovery**      | Turning feedback and history into a readiness signal                   | 6     |
| **Coaching**      | Turning engine output into the single Adaptive Coach message           | 6     |
| **Storage**       | Persistence, validation, migration, backup                             | 1 / 8 |
| **Media**         | Resolving an exercise to its poster and demonstration asset            | 2     |

Two rules keep these honest. First, an engine may call another engine but may not reimplement it —
recalibration asks the duration engine to fit; it does not carry its own timing table. Second,
recovery, fatigue, readiness, and time pressure feed **recalibration**. They never become a
parallel workout-mode system; see the locked decisions in the README.

## State and storage

Three tiers, with different durability guarantees and different rules.

**IndexedDB — durable history.** Accessed through `idb`, wrapped by a storage module that is the
only thing in the app that knows the database exists. Workouts, set records, personal records,
progression state, session feedback, profiles, and custom exercises live here. This data is
expected to survive years and hundreds of deployments.

**localStorage — small settings and active-session metadata only.** Theme, units, the last-used
location, the id of an in-progress session and where the user is inside it. It is synchronous,
tiny, and easy to reason about at startup, which is exactly what a resume path needs. It is not
a database: nothing that would hurt to lose beyond a single session goes here, and no list that
can grow without bound goes here.

**React state — ephemeral.** What is on screen right now. Never the source of truth for anything
that must survive a reload.

**Zod at every boundary.** Data crossing into the app — read from IndexedDB, read from
localStorage, imported from a backup file — is parsed, not cast. A `SetRecord` that came out of
the database is only a `SetRecord` after it has been validated. This is what makes schema
evolution survivable: an old row that no longer matches is a detected, handled condition rather
than an undefined property three screens later.

**Write → read back → verify for critical saves.** Completing a set, finishing a workout, and
restoring a backup do not trust the write. They write, read the record back, compare, and only
then report success to the UI. Quota errors, private-mode restrictions, and a browser evicting
storage mid-session are all real; a silent failure that loses a logged set is the single worst
bug this product can have.

**Nothing destructive without a rollback path.** Migration and restore write into a new version
alongside the old data and switch over only after verification. If a recalibration fails, the
previous valid workout is restored intact.

## Routing on GitHub Pages

The app uses **hash routing** (`/#/today`, `/#/workout`, …).

Pages serves static files with no rewrite rules. A history-mode route like `/workout` requested
directly — from a bookmark, a refresh, or an installed PWA restoring its last URL — is a request
for a file that does not exist, and Pages answers 404. The usual workaround, a `404.html` that
redirects into the SPA, interacts badly with a service worker: the fallback and the cached shell
race, and the failure mode is a blank screen on the deployed site while everything works locally.

Hash routing avoids the whole class of problem. The server only ever sees `/Workout-Conductor-Rebuild-v3/`,
the service worker only ever caches one navigation target, and a deep link works from a cold
start with no server cooperation.

The trade-offs, stated plainly: URLs are uglier; the hash is invisible to any future server-side
tooling; and if the app ever moves to a host with rewrites, this is a deliberate migration rather
than a free switch. For a single-origin offline app with no server, the reliability is worth it.

`base` is `/Workout-Conductor-Rebuild-v3/` in production and `/` in development, so the bundle,
the manifest `scope`/`start_url`, and the service worker scope all agree.

## PWA and update safety

The service worker is generated by `vite-plugin-pwa` with Workbox, configured for a specific
priority: **a deploy must never interrupt a workout, and must never touch stored data.**

- `registerType: 'prompt'`, `skipWaiting: false`, `clientsClaim: false`. A new build waits. It
  does not seize control of an open tab.
- The user is _asked_ to update, through an unobtrusive prompt, and the update applies on their
  action. There is no forced refresh, ever.
- **The prompt is suppressed while a workout is active.** Reloading mid-session to pick up a new
  bundle is not a trade any user would take. The update waits until the session ends.
- `cleanupOutdatedCaches: true` clears stale _cache_ entries only. IndexedDB is untouched by
  deployment. No release step may clear, reset, or "reinitialize" durable storage, and any
  migration runs behind the verify-and-rollback rule above.
- `navigateFallback: 'index.html'` gives the offline shell a single, cached entry point, which is
  the other half of the hash-routing decision.

Offline behaviour is precached static assets plus locally stored data. Because nothing is fetched
at runtime, "offline" and "online" are the same code path — there is no degraded mode to test
separately, only the absence of an update check.

## Design tokens and styling

All visual values come from CSS custom properties defined in `src/styles/tokens.css`: surfaces,
lines, the lime accent scale, the gold reserved for the Adaptive Coach card, text tiers, status
colours, radii, spacing steps, type scale, shadows, layout metrics, and motion timings.

Components use tokens. Raw hex, ad-hoc pixel spacing, and one-off font sizes in a component are
review failures. The reason is not tidiness — it is that a token change must be able to restyle
the whole product, and a single hardcoded colour makes that untrue.

Layout is mobile-first and shell-constrained: `--wc-shell-max` caps the content column, and
`--wc-safe-top` / `--wc-safe-bottom` keep content clear of the notch and the gesture bar. The
bottom navigation is fixed at `--wc-nav-h`, and scrollable content reserves that space rather
than sliding under it.

## Testing

A pyramid, weighted deliberately toward the bottom.

**Vitest unit tests** cover the engines. This is where the product's actual behaviour is
specified: given this request, this session; given this change mid-workout, these remaining
exercises; given this history, this next prescription. Because the engines are pure, these tests
are fast, exhaustive, and stable. Fixtures are synthetic and committed.

**Component tests** (Testing Library) cover the small number of components with real interaction
logic — the set logger, the duration control, dialogs. They assert what a user can see and do,
not implementation details.

**Playwright** covers the browser: the app boots on the deployed base path, the service worker
registers, routing survives a reload, and the mobile-viewport matrix in
[`docs/mobile-test-report.md`](./mobile-test-report.md) shows no horizontal overflow at any
supported width and zoom. Playwright also captures the screenshots in `docs/screenshots/`.

Two standing rules. A bug fix arrives with the test that would have caught it. And a negative
claim ("nothing reaches this state") needs a probe capable of returning yes — a check that can
only ever pass proves nothing.

## CI and the Pages gate

GitHub Actions runs the same commands as `npm run verify`, then builds and deploys to Pages.

The gate matters more than the deploy. **A failing gate must never replace a working
deployment.** If lint, types, tests, the build, the privacy scan, or the build verification
fails, the workflow stops and the previously deployed site stays live. Users keep a working app;
we get a red run to fix. Publishing a broken bundle because "the fix is coming" is not an option,
and neither is disabling a check to make the pipeline green.

`npm run verify:build` exists because a green build is not the same as a deployable one. It
asserts what CI cannot infer from an exit code: that asset paths carry the repository base, that
the build marker is present in the output, that the manifest and service worker were emitted, and
that the entry HTML references the hashed bundle it should.

Deploys are also batched deliberately. Every push costs a CI run and a Pages deployment, and
several in quick succession queue behind each other; work is grouped into meaningful pushes
rather than trickled out commit by commit.

## Build markers

Four values are injected at build time via Vite `define`: `__BUILD_MARKER__`, `__BUILD_PHASE__`,
`__BUILD_COMMIT__`, and `__BUILD_TIME__`. The marker is rendered on screen.

This is deliberate and it is not debug cruft. Reviewing a deployed PWA means answering "am I
looking at the new build or a cached old one?" before anything else, and a service worker
configured never to force-refresh makes that question harder, not easier. An on-screen marker
turns it into a glance.

## Current status

As of Phase 0, the following exists:

- Repository, license, ignore rules, and these documents.
- Vite + React 19 + TypeScript scaffold with strict compiler settings.
- Design tokens and global CSS.
- The application shell: layout, hash routing, and the five-tab bottom navigation
  (Today, Workout, Progress, Plan, Settings).
- Honest placeholder screens for each tab — empty states, not mock data.
- PWA manifest, icons, and a service worker configured for prompt-to-update.
- The visible build marker.
- CI, the verification scripts, and the Pages deployment path.
- First Android-sized screenshots from the real running app.

The following **does not exist yet**, and nothing in this document should be read as claiming
otherwise:

- No onboarding, profile, location, or equipment setup.
- No IndexedDB layer, no schemas, no persistence of any kind.
- No exercise catalog and no media.
- No generation, duration, volume, or scoring engine — `src/engine/` is empty.
- No recalibration, no conflict detection, no alternatives.
- No set logging, no active workout, no supersets.
- No progression, no recovery model, no Adaptive Coach.
- No progress views, no plan, no personal records, no session summary.
- No export, import, or backup.

The engine documents in this folder are specifications for work not yet started. Each carries an
explicit status line saying so.
