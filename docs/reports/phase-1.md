# Phase 1 — Product Foundation and First Useful Live Preview

**Status: YELLOW — submitted for review.**

|              |                                                          |
| ------------ | -------------------------------------------------------- |
| Live app     | https://bill6006.github.io/Workout-Conductor-Rebuild-v3/ |
| Build marker | _pending deployment_                                     |
| Commit       | _pending deployment_                                     |
| Workflow run | _pending deployment_                                     |

## Scope

Turn the Phase 0 shell into a real early product: a step-by-step setup, a durable local
profile, editable settings, and a Today dashboard that reflects the user's own answers —
with a clearly labelled sample session standing in until the workout engine arrives.

Phase 1 builds the foundation everything later sits on. It deliberately builds no training
intelligence.

## Delivered

**Onboarding** — an eight-step setup: welcome, goals, experience and style, schedule,
places, techniques and rest, limits and preferences, and a review step that summarises the
answers with a per-section edit affordance. Progress is shown as "Step N of 8". An
in-progress draft is kept in localStorage, so closing the tab mid-setup loses nothing, and
is cleared on finish. "Skip setup" writes the documented defaults so the app is explorable
immediately. Setup is re-runnable from Settings and starts from the existing profile
rather than wiping it.

**The data layer** — Zod schemas as the single source of truth for the profile shape,
IndexedDB (via `idb`) for durable data, and localStorage strictly for small settings and
the setup draft. Unknown fields written by a future version of the app survive a
read/write cycle intact, which is what makes a forward-compatible schema possible.

**The verified-save contract** — every critical write goes through one path that validates
the value, writes it, reads it back, revalidates the read-back, and deep-compares it before
reporting success. A mismatch restores the previous value, and the restore is itself read
back and verified. The UI never claims a save succeeded, or that data was restored, on the
strength of an unchecked write. Writes are serialised per key, so two saves in flight
cannot clobber one another.

**Settings** — every profile field is editable, backed by that same save path, with real
confirmation only after a verified write and a readable error with a retry when one fails.
Locations can be added, renamed, re-equipped, deleted, and set active; deleting the last
one is refused with a reason. Equipment comes from one canonical catalogue module.

**Export and import** — a backup envelope is serialised to a JSON file on explicit user
action. Import previews before it applies: what the file contains, its schema version, and
any problem. A wrong-app, malformed, or future-version envelope is refused in plain
language and nothing changes.

**Today** — the date, the day's training status, the active location, the planned length,
and the training style, all read from the real profile. Below it, a labelled sample
session.

**The demo session** — a static, hand-written fixture in one file. It is not a generator,
it is never written to storage, it is never counted as training, and it is marked as a demo
in four places. The file documents its own deletion in Phase 3 so it cannot quietly become
a second source of truth for what a workout is.

## Not in scope

Not built in this phase, and their absence is not a defect:

- The workout generation engine, duration fitting, and the working 15/30/45/Default
  dropdown (Phase 3).
- The exercise catalog, media, and conflict engine (Phase 2).
- Recalibration, alternatives, set logging, rest timer, supersets (Phases 4 and 5).
- Progression, recovery, and the Adaptive Coach (Phase 6).
- History, analytics, personal records, and the session summary (Phase 7).
- Full backup and exact restore of history and custom content, and optional legacy import
  (Phase 8).

## Tests

| Gate                            | Result                                        |
| ------------------------------- | --------------------------------------------- |
| `npm run lint`                  | pass — 0 errors, 0 warnings                   |
| `npm run typecheck`             | pass — app, node, and e2e projects            |
| `npm test` (Vitest)             | pass — 606 tests, 47 files                    |
| `npm run build`                 | pass                                          |
| `npm run privacy:scan`          | pass — 232 source files, lockfile, and bundle |
| `npm run verify:build`          | pass — 11 of 11 checks                        |
| `npm run test:e2e` (Playwright) | pass — 147 tests, 3 projects, no flakes       |

Mobile matrix: see [mobile-test-report.md](../mobile-test-report.md). All 16 width by zoom
combinations pass on every new screen, including each setup step.

## Performance

Measured on the production build served from the deployed sub-path, in Chromium at
360x800. "Shell interactive" is navigation start to the build marker being present.

| Metric                                                | Value                                      |
| ----------------------------------------------------- | ------------------------------------------ |
| First paint payload (gzipped)                         | ~114 KB — app 93.2, React 17.2, CSS 3.5    |
| Cold first visit, pessimistic (4x CPU, 1.6 Mbps)      | 1762 ms median of 5 — under the 2 s target |
| Cold first visit, mid-range Android (2x CPU, 10 Mbps) | 542 ms median of 5                         |

The payload grew when Zod, `idb`, and the whole setup flow arrived, and the first
measurement came in at 2135 ms — over the plan's 2-second target. Splitting the four
non-landing tabs and the setup flow into their own chunks brought the first-paint payload
from ~141 KB to ~114 KB gzipped and startup back under target. Today and the shell load
eagerly because Today is the landing route; everything else waits for a deliberate tap.

Zod is now the largest single item in the initial chunk. Moving to `zod/mini` would shrink
it further, but it is a cross-cutting API change and was not worth the regression risk at a
phase gate. Worth revisiting if the payload becomes a problem again.

## Screenshots

Captured from the real running build — one device screen per shot, which is what the phone
shows. See [docs/screenshots/phase-1/](../screenshots/phase-1/).

40 files: all eight setup steps and all five tabs at 360x800 and 412x915 (Android) and at
1280x900 (desktop), plus a combined contact sheet.

## Known limitations

- There is no workout engine. Start Workout is disabled and says so.
- The workout-length control is an inert display until Phase 3. It remains the only
  workout-length control in the product — there is no second start button and no competing
  workout-mode system, and a test fails the build if one appears.
- The session on Today is a labelled demo, never saved and never counted as training.
- Exercise preferences are free text until the Phase 2 catalog lands.
- Export and import cover the profile only. History, custom content, and notes join in
  Phase 8, along with exact restore and rollback.
- Workout and Progress are still Phase 0 placeholders.

## What the review found, and what changed

The build was reviewed adversarially across four lenses before deployment: the phase
contract, data integrity, UX and accessibility, and privacy and pipeline health. It found
35 defects — 5 blockers and 13 majors — and all of them were repaired before this
deployment. The ones worth naming:

- **The rollback write was itself unverified.** The one write whose entire job is to protect
  data the user already has was reporting "restored" on an unchecked promise. It is now read
  back, revalidated, and compared, and the result distinguishes a verified restore from one
  that could not be confirmed — the user is never told their data is safe on a guess.
- **Concurrent saves could clobber each other.** Two overlapping writes interleaved their
  read-backs and rollbacks, so one could report success while the other's rollback ate it.
  Saves are now serialised per key.
- **A save wrote before it validated.** Invalid data physically reached IndexedDB and relied
  on the rollback to undo it. Validation now happens first.
- **Creating a default profile could overwrite an unreadable one.** A profile that failed to
  load — corrupt, or written by a future version — looked identical to no profile at all, so
  the app would write defaults over it. That is silent data loss for exactly the user whose
  data most needs protecting. It now refuses and says why.
- **The privacy scan was failing and would have blocked the deploy.** Zod bakes
  `json-schema.org` dialect identifiers into the bundle as inert strings. Allowlisting them
  was the fix; the rule was then re-tested against a planted CDN URL, a Google Fonts URL, an
  analytics host, a Sentry host, and a GitHub token, and still catches all five.
- **The bottom navigation was live during first-run setup**, so five tabs led to a dead end
  mid-flow. It is hidden while setup is being forced.
- **The header tagline still truncated** — the Phase 0 fix had only ever been checked in
  Segoe UI, and Android resolves to Roboto. It is now verified in Roboto, DejaVu Sans, Segoe
  UI, and Verdana at five widths, with a test so it cannot regress a third time.
- **Two rival display-label catalogues had drifted apart**, so the same stored value read
  differently depending on the screen. Collapsed to one.

## Review decision

The owner reviews the live app and records one of `GREEN - NEXT PHASE`,
`YELLOW - FIX: <issue>`, or `RED - STOP`. This phase does not advance itself.

**Decision:**

**Reviewed by:**

**Date:**

**Notes:**
