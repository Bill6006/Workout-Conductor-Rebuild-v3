# Phase 4 — Central Recalibration Engine

**Status: YELLOW — submitted for review.**

|              |                                                          |
| ------------ | -------------------------------------------------------- |
| Live app     | https://bill6006.github.io/Workout-Conductor-Rebuild-v3/ |
| Build marker | _pending deployment_                                     |
| Commit       | _pending deployment_                                     |
| Workflow run | _pending deployment_                                     |

## Scope

One place decides what a session may change into. Every trigger that can alter a workout —
a different length, a busy squat rack, a reported ache, a skipped exercise — goes through
the same engine, so there is exactly one implementation of "what may be rewritten and what
may not".

## Delivered

**One engine, one entry point.** Phase 3 deliberately left the generator with a single entry
point so this could wrap it rather than compete with it. A full rebuild here calls
`generateWorkout`; it does not reimplement generation.

**The trigger registry.** All 22 triggers the product plan names, each mapped to a scope.
The scope is what stops a small change becoming a big one: replacing an exercise, working
around busy equipment, or a taken station are `single-exercise` and touch nothing else;
performance, pain, readiness and resuming are `remaining-session`; a length, location, or
technique change is `full-session`. The plan is explicit that a full recalibration is the
wrong answer to a local change, and this is where that is enforced.

**Completed work is never lost — checked, not assumed.** Every result is verified on the way
out: if a recalibration would drop or alter a single logged set, it is refused and the
previous session is handed back intact. A rule enforced only by the code that intends to
obey it is not enforced, so this is a post-condition rather than a convention.

**Locking, with reasons.** An entry with any logged record is locked; so is a pinned one, an
exercise the user explicitly chose, and the current exercise once its first _working_ set is
logged. Warm-up sets deliberately do not lock an exercise — someone who has warmed up and
then finds the rack taken should still be able to swap the movement, and the plan already
treats warm-ups as outside progression and PR evidence. A superset locks as one block,
because half a locked superset is not a thing a session can contain.

**Failure restores.** There is no partial state. Either a valid new session comes back, or
the old one does with a readable line — never a stack trace, never a half-applied change.

**The change summary.** The compact line the plan asks for — "Rebuilt for 30 min: 2
exercises removed, 1 exercise with fewer sets, a superset removed." — plus the structured
changes behind it, so the sentence a person reads and the rows a screen highlights can never
disagree. The diff is keyed by exercise rather than entry id, because a rebuild mints new
ids and comparing those would report every exercise as removed and re-added.

**The calibration overlay.** Every requirement the plan lists for it: shows immediately,
blocks the taps that could corrupt a recalculation, keeps the screen where it was, names the
trigger, lists what the engine is actually weighing, offers cancel only when it is safe,
shows a readable error on failure with the reassurance that nothing changed, and respects
reduced motion. **It adds no artificial delay** — the work is milliseconds, and the plan says
to use a brief transition, not to make the app look busy.

**Session-only Equipment Busy.** Equipment can be marked unavailable for this session
without touching the saved equipment profile, and the engine swaps around it.

## Not in scope

- The active workout screen, set logger, and rest timer (Phase 5). There is no UI yet that
  can _produce_ a logged set, so locking is proven against constructed sessions rather than
  against the logger — that seam is exactly what Phase 5 fills.
- Alternatives UI and one-tap exercise replacement (Phase 5). The engine's substitution is
  deliberately narrow — same primary muscle and pattern, actually available — rather than a
  second alternatives ranker.
- Progression, recovery models, and the Adaptive Coach (Phase 6).

## Tests

| Gate                            | Result                              |
| ------------------------------- | ----------------------------------- |
| `npm run lint`                  | pass — 0 errors, 0 warnings         |
| `npm run typecheck`             | pass — app, node, and e2e projects  |
| `npm test` (Vitest)             | pass — 1872 tests                   |
| `npm run build`                 | pass                                |
| `npm run privacy:scan`          | pass — source, lockfile, and bundle |
| `npm run verify:build`          | pass — 11 of 11 checks              |
| `npm run test:e2e` (Playwright) | pass — 176 tests, 3 projects        |

The engine's own suite covers the things whose failure would cost real work: a logged set
carried byte-for-byte through a full rebuild, the exercise it belongs to kept, skipping a
logged exercise refused with a readable reason and the previous session returned, a warm-up
set not locking an exercise, a superset whose partner has logged sets left intact, a local
change touching exactly one row, elapsed time coming off the budget, session identity kept
across a rebuild, and no duplicate ids when preserved and regenerated blocks meet.

## Performance

| Metric                                   | Value                         |
| ---------------------------------------- | ----------------------------- |
| Entry payload (gzipped)                  | ~97 KB (Phase 3: ~95 KB)      |
| Four full recalibrations                 | well inside the 700 ms budget |
| Duration change, measured in the browser | a few milliseconds            |

The plan's targets are under 250 ms for a simple local recalibration and under 700 ms for a
full one on an average Android phone. Both have a great deal of room. The engine and the
overlay ride the same lazy chunk as the generator and the catalog, so first paint grew by
about 2 KB.

## Screenshots

See [docs/screenshots/phase-4/](../screenshots/phase-4/) — 40 files from the real running
build.

## Defects found and fixed during the phase

- **Preserved and regenerated blocks collided on ids.** The generator numbers from one every
  time, so a kept `block-1` and a freshly built `block-1` were the same id for two different
  things — which the workout schema rightly rejected, and which showed up as "the rebuilt
  session was not valid" the first time a session with a logged set was recalibrated. Fresh
  blocks are now re-ided, and the explanation, compromises, and warm-up references are
  remapped so none of them dangle.
- **A superset swap was typed as an array rather than a pair.** Mapping the two moves and
  casting back would have compiled while quietly accepting a one-move superset; the pair is
  now rebuilt explicitly.
- **The replacement record did not match its own schema** — wrong field name and a free-text
  reason where the schema wanted its enum.

## How this phase was verified

Built directly rather than delegated, and driven against real generated sessions at each
step — which is how the id collision surfaced, on the third thing I tried rather than in
review. No adversarial review ran, as with Phases 2 and 3.

## What to look at

On Today, change the workout length and watch the line that appears under the control. It
should say what actually moved, and the session under it should match that sentence. Then:

- Does the summary tell you something useful, or just that something happened?
- Change the length several times in a row — does it stay coherent?
- The screen should not jump when the session rebuilds.

## Known limitations

- **Nothing can log a set yet**, so the locking rules are proven by tests rather than by
  use. Phase 5 is where they start protecting real work.
- The overlay is mounted and correct but rarely visible, because a rebuild is a few
  milliseconds. It will matter more when Phase 5 recalibrates mid-session.
- Equipment Busy exists in the engine; the affordance to mark something busy arrives with
  the Phase 5 exercise cards.
- The engine's substitution picker is intentionally narrow. The full alternatives ranker
  from Phase 2 gets its UI in Phase 5.
- Still 0 of 127 exercises have a real demonstration — the decision from the Phase 2 report
  is still open.

## Review decision

The owner reviews the live app and records one of `GREEN - NEXT PHASE`,
`YELLOW - FIX: <issue>`, or `RED - STOP`. This phase does not advance itself.

**Decision:**

**Reviewed by:**

**Date:**

**Notes:**
