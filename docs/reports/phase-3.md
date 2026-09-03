# Phase 3 — Workout Generation and Duration Engine

**Status: YELLOW — submitted for review.**

|              |                                                          |
| ------------ | -------------------------------------------------------- |
| Live app     | https://bill6006.github.io/Workout-Conductor-Rebuild-v3/ |
| Build marker | _pending deployment_                                     |
| Commit       | _pending deployment_                                     |
| Workflow run | _pending deployment_                                     |

## Scope

The app stops describing training and starts deciding it. Today now shows a session built
for your goals, your equipment, your location, and the time you have — and the one
workout-length control actually works.

## Delivered

**The generator.** One pure, deterministic entry point: the same profile, length, and seed
produce a byte-identical session every time. It reads no clock and calls no random number
generator — the date, the timestamp, and the variety seed are all supplied by the caller,
which is what makes a session reproducible, diffable, and testable.

**What it composes.** Muscle priorities come from weekly volume targets biased by your
goals and by how recently a group was trained; exercise selection scores the catalog for
each slot with hard filters for equipment, location, limitations, and disliked exercises;
the duration engine sets the budget and costs the work; the techniques module proposes
supersets and drop sets that the generator accepts or rejects on the time it has. Conflict
judgements go through the Phase 2 conflict engine rather than being decided again here.

**The four lengths genuinely differ.** 15 / 30 / 45 / Default each get their own set
budget, group count, block ceiling, warm-up allowance, rest scaling, and — the part that
matters most — their own slot roles. A 15-minute session leads with dense machine and cable
work on short rests, because opening with a heavy compound would spend most of a quarter of
an hour standing still. From 30 minutes up there is room for the heavy movement first,
which is where it belongs.

**Rebuild, not truncate.** Choosing a shorter length rebuilds the session for that time. It
is not the longer session with the end cut off, and there is a test that fails if it ever
becomes one.

**The hybrid model in numbers.** Rep ranges slide inside each exercise's own honest range
according to the slot's role and your training style, so a strength slot sits low and an
isolation slot sits high — and a movement whose real range is 12–20 never becomes a triple.
Rest scales the same way, from about three minutes on a heavy compound down to a little over
a minute on isolation work. Tempo is prescribed only where slowing the movement is the
point, which is rarely.

**The explanation.** Every session carries the generator's own reasons — which muscle leads
and why, what the length cost, what was given up — plus an honest confidence level and its
limiters. With no logged sessions it says so rather than implying it knows more than it does.

**The demo fixture is gone.** `demoWorkout.ts` documented its own deletion for this phase
and has been deleted, along with its card. There is no labelled sample left anywhere, and a
test now fails if one returns.

## Not in scope

- The centralised Recalibration Engine, trigger registry, calibration overlay,
  completed-work locking, and failure rollback (Phase 4).
- The active workout screen, set logger, rest timer, and alternatives UI (Phase 5). **Start
  Workout is still disabled and says so** — the engine can build a session but nothing can
  yet run one.
- Progression from history, recovery and readiness models, Adaptive Coach (Phase 6).
- History, analytics, PRs, session summary (Phase 7).

## Tests

| Gate                            | Result                              |
| ------------------------------- | ----------------------------------- |
| `npm run lint`                  | pass — 0 errors, 0 warnings         |
| `npm run typecheck`             | pass — app, node, and e2e projects  |
| `npm test` (Vitest)             | pass — 1849 tests, 100 files        |
| `npm run build`                 | pass                                |
| `npm run privacy:scan`          | pass — source, lockfile, and bundle |
| `npm run verify:build`          | pass — 11 of 11 checks              |
| `npm run test:e2e` (Playwright) | pass — 158 tests, 3 projects        |

The generator's own suite asserts the things that would be easy to get wrong: every
generated session validates against the schema and contains no duplicate or single-set
exercise; each length lands inside its budget; the short session is not a prefix of the long
one; rep ranges vary rather than collapsing to one; disabled techniques never appear;
limitations, equipment, and disliked exercises are honoured; the goal bias is visible; and
the same input twice gives identical output.

## Performance

| Metric                                                | Value                         |
| ----------------------------------------------------- | ----------------------------- |
| Entry payload (gzipped)                               | ~95 KB — Phase 2 was ~94 KB   |
| Cold first visit, pessimistic (4x CPU, 1.6 Mbps)      | 1704 ms (Phase 2: 1809 ms)    |
| Cold first visit, mid-range Android (2x CPU, 10 Mbps) | 506 ms (Phase 2: 550 ms)      |
| Rebuild on a duration change                          | 4 ms                          |
| Generation, all four lengths                          | well inside the 700 ms budget |

The engine and the session cards were kept off the boot chunk, so first paint is
essentially unchanged despite the app gaining a workout engine. Startup actually improved,
because narrowing two barrel imports moved code that first paint never used off the critical
path. A duration rebuild at 4 ms is far inside the plan's 250 ms simple / 700 ms full
recalibration targets — the calibration overlay those targets were written for arrives in
Phase 4, and it will have room to spare.

## Screenshots

Captured from the real running build, with the capture now waiting for the session to be
generated rather than photographing the loading state. See
[docs/screenshots/phase-3/](../screenshots/phase-3/) — 40 files.

## What the engine actually produces

From the default profile at a fully equipped gym, the same day and seed:

- **15 min** — Seated machine row 3×10–14, Pec deck 3×11–14. Dense, low-setup, short rests.
- **30 min** — Pull-up 4×4–8, Machine chest press 4×10–14, Leg extension 3×13–19.
- **Default (60 min)** — Pull-up 4×4–8, then Machine chest press paired with Dumbbell
  lateral raise as a 4-round superset, Leg extension 4×13–19, Bulgarian split squat 4×8–12.
- **At home with dumbbells and bands** — the machine work is gone: Pull-up, Dumbbell bench
  press paired with lateral raises, Bulgarian split squat, Reverse lunge.

## Defects found and fixed during the phase

Driving the engine against the real catalog surfaced several things worth naming:

- **Sessions ran long and were simultaneously too thin.** The time model charged the rest
  after an exercise's last set _and_ a transition to the next exercise — the same gap,
  counted twice. A 30-minute session estimated at 40 and squeezed out exercises it had room
  for. Rest between sets and the transition between exercises are now separate.
- **Strength rest was 210 seconds**, the top of the sensible range rather than the middle,
  which crowded whole exercises out of a session. Now 180.
- **Slots overshot the budget instead of shrinking to fit.** A slot asked for four sets and
  got four even when the remaining time held two. It now fits, with two sets as the floor —
  below that the setup costs more than the work is worth.
- **Single-set exercises appeared at the tail** of longer sessions. That is exactly the
  "junk volume" the plan names, and it is now refused.
- **A one-round superset** was being emitted — two exercises done once, dressed up as a
  technique. The pairing is now rejected before it is built rather than unpicked after,
  which also fixed an exercise appearing twice in the same session.
- **15 minutes led with a heavy compound.** It passed every structural test but it was the
  wrong session: three-minute rests inside a fifteen-minute window. Slot roles now vary by
  duration, which is what makes a short session genuinely different rather than smaller.
- **The engine landed on the boot chunk**, adding ~16 KB to first paint for code the landing
  route cannot use until two lazy chunks arrive. It now rides the same boundary. Two barrel
  imports were also pulling the exercise and workout Zod schemas onto first paint.
- **The e2e state helper opened IndexedDB at version 1** after the database moved to 2,
  which failed 46 browser tests with a `VersionError` that had nothing to do with the app.

## How this phase was verified

The five-agent engine build was interrupted twice by session limits, so after the session
model landed I built the remaining engine — volume, selection, duration, techniques, and the
generator — directly, and drove it against the real 127-exercise catalog at every step. The
defects above were all found that way rather than by reading code.

**No adversarial review ran for this phase, as with Phase 2.** The generator's own test
suite is substantial and deliberately adversarial about the locked rules, but it cannot tell
you whether the _training_ is good. That judgement is yours, and it is the most valuable
thing you can bring to this gate.

## What to look at

Open Today and change the length. The four sessions should each look like a sensible use of
that time — not one session with fewer rows. Specifically worth your eye:

- Does the 15-minute session look like something you would actually do in 15 minutes?
- Are the rep ranges and rests right for the role each exercise is playing?
- Does the default session look like a session you would run, or like a list of exercises?
- Set your location to Home in Settings and check it stops offering machines.

## Known limitations

- **No history, so no progression.** Every weight target is "unknown" with a reason. Phase 6
  turns logged performance into next targets.
- **Circuits are modelled but never proposed.** The rule needs fatigue data that arrives in
  Phase 6, and the plan says not to force circuits into strength-priority sessions.
- Readiness and recovery are accepted as inputs but nothing supplies them yet.
- The session is generated fresh on each visit rather than pinned once a day; Phase 4's
  recalibration work is where a session becomes something you hold onto and adjust.
- Warm-ups are planned and flagged but not yet ramped per exercise.

## Review decision

The owner reviews the live app and records one of `GREEN - NEXT PHASE`,
`YELLOW - FIX: <issue>`, or `RED - STOP`. This phase does not advance itself.

**Decision:**

**Reviewed by:**

**Date:**

**Notes:**
