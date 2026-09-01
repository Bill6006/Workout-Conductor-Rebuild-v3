# Central recalibration engine

**Status: not yet implemented.** This is the agreed contract, written ahead of the work.

- **Owner phase:** Phase 4 — Central Recalibration Engine
- **Location:** `src/engine/recalibration/`
- **Depends on:** the generation engine, the duration engine, the conflict engine

## Purpose

One engine, one entry point, for every mid-session change. When anything about the workout's
context changes — the time available, the equipment, the location, how the user feels, how a set
actually went — recalibration decides what the **remaining** workout should be.

This is centralised on purpose. The failure mode it prevents is five different screens each
implementing their own idea of "adjust the workout", producing five subtly different answers to
the same situation. There is exactly one function:

```text
recalibrate(request: RecalibrationRequest) → RecalibrationResult
```

Every surface that can change a workout calls it. No feature adjusts a session directly.

## RecalibrationRequest

A single typed request object. Every field is explicit; nothing is read from ambient state.

| Field                 | Meaning                                                             |
| --------------------- | ------------------------------------------------------------------- |
| `trigger`             | Why recalibration was requested (see trigger list)                  |
| `currentWorkout`      | The full session as it stands right now                             |
| `completedWork`       | Every set already logged, with its actual load, reps, and RIR       |
| `lockedExercises`     | Exercises that may not be changed or removed                        |
| `lockedCompletedSets` | Individual sets that may not be altered                             |
| `currentExercise`     | The exercise the user is on, if any                                 |
| `requestedDuration`   | `15` \| `30` \| `45` \| `'default'`                                 |
| `location`            | Active location profile                                             |
| `equipment`           | Equipment currently available                                       |
| `preferences`         | Likes, dislikes, preferred patterns                                 |
| `limitations`         | Injuries and restricted movements, including ones added mid-session |
| `recovery`            | Readiness and per-muscle fatigue state                              |
| `performanceChanges`  | How logged sets compare to what was prescribed                      |
| `reason`              | Optional user-supplied reason, for the coach message and the log    |
| `timestamp`           | Supplied by the caller; the engine never reads the clock            |

## Triggers

The complete list. A trigger not on this list is a design change, not a code change.

- `duration-changed` — the dropdown moved
- `location-changed` — the user switched gym / home / travel
- `equipment-changed` — a machine is occupied, broken, or newly available
- `exercise-swapped` — the user chose an alternative
- `exercise-skipped` — the user skipped an exercise outright
- `exercise-removed` — the user deleted an exercise from the session
- `exercise-added` — the user inserted an exercise
- `limitation-added` — a pain or restriction reported mid-session
- `recovery-changed` — readiness or fatigue input updated
- `performance-deviation` — logged sets are materially above or below prescription
- `time-pressure` — elapsed time says the session will overrun
- `preferences-changed` — a like or dislike registered mid-session
- `session-resumed` — an interrupted session was reopened later
- `manual` — the user explicitly asked for a rebuild

## Priority rules

These are absolute. They are what makes the feature trustworthy.

**1. Completed work is immutable.** Recalibration may never change a completed exercise, a
completed set, or its logged weight, reps, RIR, tempo, or notes. It may never revoke a personal
record and may never delete or edit a user note. History is a record of what happened; an engine
does not rewrite it.

**2. The current exercise locks on its first working set.** Once the user has logged one working
set of an exercise, that exercise stays in the session, in its position, with its identity
intact. Remaining sets of it may be re-prescribed — load, reps, or set count can change — but
the exercise itself is not swapped out from under someone standing at the rack.

**3. Only the remaining workout is recalculated.** Everything before the current position is
fixed input, not material to rework.

**4. Volume and role continuity are preserved where possible.** If an exercise is replaced, its
role in the session is filled, not dropped, unless the constraint that forced the change makes
that impossible.

**5. Constraints beat preferences.** A limitation or an equipment absence overrides a liked
exercise, every time.

## Outputs

`RecalibrationResult` is a discriminated union:

- **`applied`** — the new remaining workout, the diff against the previous one (added, removed,
  re-prescribed, reordered), an updated duration estimate, and a short human explanation for the
  Adaptive Coach.
- **`no-change`** — the request was valid but nothing needed to change. This is a normal outcome
  and must not be presented as a failure or as a rebuild.
- **`failed`** — with a reason. See rollback.

The diff exists so the UI can show what changed rather than silently presenting a different
session.

## Failure and rollback

If recalibration cannot produce a valid workout — no viable exercises, a constraint set with no
solution, an internal invariant violated — it fails cleanly:

- The **last valid workout is restored, intact**, including all logged work.
- The user is told what could not be satisfied, in plain language.
- The session continues. A failed recalibration never ends, corrupts, or blanks a workout.
- Nothing is persisted from a failed attempt.

The engine is pure, so rollback is trivial: the caller simply keeps the previous value. There is
no partially-mutated state to unwind.

## The calibration overlay

Recalibration is visible. When it runs, a brief overlay states what is being recalculated —
"Rebuilding for 15 minutes", "Adjusting around the occupied cable stack" — rather than showing a
generic spinner. The user should never wonder whether their tap registered.

Contract:

- The overlay appears only for recalculation, never for a local UI change.
- It never blocks logging already-completed work.
- On `no-change`, it resolves without claiming a rebuild happened.
- On failure, it hands off to a clear message, not a stuck spinner.

## Performance targets

| Case                                                      | Target   |
| --------------------------------------------------------- | -------- |
| Simple recalibration (swap, skip, single-exercise change) | < 250 ms |
| Full rebuild (duration, location, or equipment change)    | < 700 ms |
| Network requests                                          | **zero** |

Recalibration never makes a network request. It cannot: there is no backend. If a change ever
appears to need one, the design is wrong.

Missing the target is a defect, not a tuning opportunity. These budgets are measured in the
Phase 4 report.

## Local changes must not trigger a full rebuild

Expanding a card, viewing an alternative without choosing it, scrolling, toggling a display
option, opening the exercise detail sheet — none of these are recalibration triggers. They change
what is on screen, not what the workout is.

Calling `recalibrate` for a local UI change is a defect. It burns the budget, flashes the
overlay, and teaches the user that the app churns for no reason.

## Invariants

1. Recalibration is pure, deterministic, and free of side effects.
2. Completed exercises, sets, weights, reps, RIR, PRs, and notes are never modified.
3. The current exercise is locked once its first working set is logged.
4. Only the remaining workout changes.
5. A failure restores the last valid workout with no data loss.
6. The result always satisfies the conflict engine.
7. No network request, no storage access, no clock read.
8. `no-change` is a valid, common, non-error outcome.

## Testing

Fixtures for every trigger, at several session positions: before the first set, mid-exercise,
between exercises, and near the end. Assert the immutability rules directly — a test that mutates
a completed set must fail. Assert rollback by injecting a generation failure. Measure the two
performance budgets in CI with representative session sizes.
