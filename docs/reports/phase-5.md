# Phase 5 — Active Workout, Logging, and Superset Experience

**Status: YELLOW — submitted for review.**

|              |                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| Live app     | https://bill6006.github.io/Workout-Conductor-Rebuild-v3/                                             |
| Build marker | `phase5-14-934d923`                                                                                  |
| Commit       | [`934d923`](https://github.com/Bill6006/Workout-Conductor-Rebuild-v3/commit/934d923)                 |
| Workflow run | [run 33790523585](https://github.com/Bill6006/Workout-Conductor-Rebuild-v3/actions/runs/33790523585) |

## Scope

The app becomes usable in a gym. Start Workout works, sets are logged one-handed, and the
session survives closing the app mid-workout.

## The Set Logger, and why it is not a button grid

The plan rules out specific answers — no cluster of tiny plus and minus buttons, no
calculator keypad, no giant row of equally weighted buttons, no separate edit page — and
sets the bar: minimal taps, thumb reachable, large readable values, obvious current set,
easy undo, any completed value tappable to correct.

A button grid fails twice over. It gives every value the same visual weight, so nothing
tells you where you are. And it costs a tap per increment, which is fine for reps and
hopeless for weight: 60 kg to 82.5 kg is nine taps on a +2.5 button.

So the logger is built on a different observation: **the target is almost always right**. A
session prescribes four sets of 8–12 at a weight you used last time, and the common case is
doing exactly that. The design makes that case one tap and makes departing from it cheap.

**Measured taps to log a set:**

| Case                                       | Taps  | A +/- grid would cost |
| ------------------------------------------ | ----- | --------------------- |
| At the prescribed target (the common case) | **1** | 1                     |
| Changing reps by any amount                | **3** | 1 per rep             |
| Changing weight by one increment           | **3** | 2                     |
| Changing weight by 22.5 kg                 | **3** | 10                    |
| Correcting a set already logged            | **2** | opens an edit page    |

Changing a value is a flat three taps regardless of distance, because tapping the value
opens a short list of plausible options centred on the current one. Typing exists behind one
more tap for the case the list cannot reach — a fallback, not the path.

Accidental logging is guarded by making the log action the only large lime control on the
card, away from the edit affordances, and by making undo immediate rather than putting a
confirm on every set — a confirm would cost more taps than it ever saves.

## Delivered

**The active workout screen.** A short header, the block you are on, and a compact list of
everything else. The plan warns against one giant scrolling screen, so detail, alternatives,
and plate math are behind sheets.

**Pause and resume, as the absence of a bug.** The session is written to IndexedDB through
the verified save path after every logged set, so closing the app mid-workout and coming
back is simply loading what is there. There is no separate paused state to fall out of sync.

**The superset contract, honoured.** One combined card showing both moves; a round advances
both together; each move keeps its own durable records; and the session list shows **one row
per block** naming both moves — never one member as if another required exercise were
outstanding. The last round of the last block ends the session, which is the final-superset
completion authority the plan asks for.

**Inline correction.** A completed set is a chip you tap; the same logger opens in place and
focus returns to where you were. There is no separate edit page.

**The rest timer** runs off an end timestamp rather than a countdown, so backgrounding the
app or switching tabs cannot lose time. It shows the next set's target, adjusts in one tap,
skips, and signals completion visibly rather than with sound.

**Swapping an exercise** goes through the recalibration engine, not a local edit — that
engine is what refuses to touch logged work, and a screen editing the session directly would
be the one path around it. The alternatives come from the Phase 2 ranker.

**Plate Math, exercise demonstrations and instructions, and per-exercise notes** are built
and mounted behind their sheets.

## Not in scope

- Progression from history, readiness, and the Adaptive Coach (Phase 6). Weight targets are
  still "unknown" on a first session.
- Personal records, weekly volume, and the full Session Summary (Phase 7). What shows at the
  end of a session now is the honest subset readable from the session alone.
- Real exercise demonstrations — still 0 of 127, and still an open decision from Phase 2.

## Tests

| Gate                            | Result                       |
| ------------------------------- | ---------------------------- |
| `npm run lint`                  | pass — 0 errors, 0 warnings  |
| `npm run typecheck`             | pass                         |
| `npm test` (Vitest)             | pass — 2007 tests            |
| `npm run build`                 | pass                         |
| `npm run privacy:scan`          | pass                         |
| `npm run verify:build`          | pass — 11 of 11              |
| `npm run test:e2e` (Playwright) | pass — 200 tests, 3 projects |

The e2e spec that matters most asserts a logged set survives a full page reload — the whole
reason the session persists after every write rather than at the end.

## Screenshots

See [docs/screenshots/phase-5/](../screenshots/phase-5/) — 46 files, now including the
active workout mid-set. Photographing the empty Workout tab would not have been evidence
that the logger works, so the capture script starts a session and logs a set.

## Verified on the deployed site

Driven against the live URL on a Pixel-class Android profile: setup skipped, session started,
two sets logged, then a full page reload. **Both sets were still there.** No console errors,
no page errors.

That is the assertion this phase exists for — a session that survives the app being closed
mid-workout, in production rather than only in a test.

Live capture: [live-android-360-workout.png](../screenshots/phase-5/live-android-360-workout.png)

## Defects found and fixed during the phase

- **A logged session leaked between tests.** The app deliberately remembers an in-progress
  session across reloads, which meant one test's session resumed inside the next one. The
  suite now clears the settings namespace between tests — the whole namespace, not a known
  key, so a new setting cannot quietly start leaking later.
- **The rest timer was below the session list**, where nobody would see it during a rest. It
  sits under the current block now, which is where you are looking between sets.
- **The empty Workout tab used a button to navigate.** That is a link: it should
  middle-click, long-press, and announce as a link.
- **A hydration wait was too tight** — one second, which passed in isolation and timed out
  under a full 105-file run. That is the signature of a loaded machine rather than a bug.

## Known limitations

- Weight targets read as unknown until Phase 6 turns logged performance into next targets.
  The logger seeds from your last set on the same exercise, which covers the common case.
- Per-exercise notes are held for the session but not yet persisted to the profile; the cue
  memory that survives between sessions belongs with Phase 6's progression state.
- Warm-up Add/Skip is modelled in the session but has no dedicated control yet.
- Drop sets are programmed and shown but have no separate in-set flow.
- Exercise demonstrations are placeholder posters, labelled as such.

## How this phase was verified

The engine spine — session state, logger, superset card, screen — was built directly and
driven in a browser at each step: start a session, log sets, reload, confirm the work is
still there. The four leaf components (rest timer, plate math, exercise detail, alternatives)
were built in parallel by agents against fixed contracts, then mounted and re-verified here.
No adversarial review ran, as with Phases 2 through 4.

## What to look at

This is the first phase you can actually use. On your phone:

- Start a workout and log a few sets. Is one tap right for the common case?
- Tap a weight or rep value — does the picker feel faster than plus/minus would?
- Tap a completed set to correct it. Does it put you back where you were?
- **Close the app mid-session and reopen it.** Your sets should be exactly where you left them.
- Does the rest timer show up where you would look for it?

## Review decision

The owner reviews the live app and records one of `GREEN - NEXT PHASE`,
`YELLOW - FIX: <issue>`, or `RED - STOP`. This phase does not advance itself.

**Decision:**

**Reviewed by:**

**Date:**

**Notes:**
