# Workout generation engine

**Status: not yet implemented.** This is the agreed contract, written ahead of the work so
Phase 3 has something to build against and later phases cannot drift from it.

- **Owner phase:** Phase 3 — Workout Generation and Duration Engine
- **Location:** `src/engine/generation/`
- **Depends on:** catalog metadata, the conflict engine (Phase 2), the volume and scoring
  helpers that ship alongside it

## Purpose

Turn a request — who is training, for how long, where, with what — into a complete, ordered,
prescribed session. Generation is the only place a whole workout comes into existence.
Recalibration rebuilds sessions, but it does so by calling into this engine, not by carrying its
own copy of the rules.

## Pure and deterministic

`generateWorkout(request, catalog, seed) → Workout`

- No React, no DOM, no storage, no clock, no `Math.random()`.
- The current time and any shuffle seed are explicit inputs.
- The same request, catalog, and seed always produce the same workout, on every machine, forever.
- Inputs are never mutated; a new `Workout` is returned.

This is what makes "it gave me a bad session on Tuesday" reproducible as a fixture.

## Inputs

`GenerationRequest`:

| Field               | Meaning                                               |
| ------------------- | ----------------------------------------------------- |
| `profile`           | Experience, goals, units, training age                |
| `requestedDuration` | `15` \| `30` \| `45` \| `'default'`                   |
| `location`          | Which location profile is active                      |
| `equipment`         | Resolved equipment available at that location         |
| `preferences`       | Liked / disliked exercises, preferred patterns        |
| `limitations`       | Injuries, restricted joints, movements to avoid       |
| `recovery`          | Per-muscle-group recovery state and overall readiness |
| `history`           | Recent sessions, for volume balance and rotation      |
| `progression`       | Per-exercise progression state, for prescriptions     |
| `now`               | Timestamp, supplied by the caller                     |

## Outputs

A `Workout` containing ordered `WorkoutExercise` blocks, each with a role, a prescription
(target sets, rep range, load guidance, RIR target, rest), a time estimate, and the reasoning
tags that let the UI explain a choice. The workout carries its own total time estimate and the
duration it was built for.

Generation returns a result, not a throw: an unsatisfiable request (no equipment, everything
excluded) produces a diagnosable failure the caller can present, not an exception.

## Hybrid strength + hypertrophy roles

Sessions are not one-dimensional. Every exercise is placed with an explicit role:

- **Primary strength** — heavy compound, low reps, long rest, placed first while fresh.
- **Secondary strength** — supporting compound at moderate load.
- **Primary hypertrophy** — the main volume drivers for the session's target muscles.
- **Accessory hypertrophy** — isolation work, higher reps, short rest.
- **Corrective / prehab** — optional, small, placed where fatigue does not matter.

The mix shifts with goal, experience, and available time, but the ordering invariant holds:
heavy and technical work comes before fatiguing volume work.

## The duration contract

The only duration control in the product is a single dropdown: **15 min / 30 min / 45 min /
Default time**. There are no workout modes and no second start button.

The rule that matters most:

> **Changing duration REBUILDS the session for that duration. It never truncates the tail.**

A 45-minute session cut to 15 minutes is not "the first three exercises of the 45-minute
session". It is the best possible 15-minute session for this user, this location, and this
moment — which will usually mean different exercises, different set counts, and a different
structure, not a prefix of the longer plan. Truncation produces sessions with a warm-up and no
work in them, and it is explicitly forbidden.

Duration estimation accounts for working sets, warm-up sets, prescribed rest, transitions
between stations, and the compression that supersets and circuits provide. Sessions are fitted
to the target with a tolerance rather than padded to it exactly.

**Default time** resolves from the profile — it is a real number under the hood, not a fifth
behaviour.

## Supersets

A superset is **one two-move block** in the session structure and in the UI: a single card, a
single position in the order, a single rest prescription for the pair.

It is **two durable records** in storage. Each exercise keeps its own `WorkoutExercise` and its
own `SetRecord` rows, so progression, volume accounting, personal records, and history all see
two normal exercises. Nothing downstream needs to understand supersets.

Pairing rules: no shared limiting station, no conflicting equipment demand, no antagonistic
requirement that fatigue would ruin, and no pairing that the conflict engine rejects. A pair
that cannot be honoured degrades to two straight sets rather than failing the session.

## Optional intelligent drop sets

Off by default. When enabled, drop sets are applied surgically, not sprinkled:

- Only on isolation or machine work where load can be reduced safely and quickly.
- Only on the final working set of a chosen exercise.
- Only when the session has time pressure or an explicit intensity goal that justifies them.
- Never on a primary strength lift, never under a limitation affecting that movement, and never
  when recovery is poor.

Each drop is a durable record attached to its parent set, flagged as a drop so it is not counted
as an independent working set.

## Optional circuits

Off by default. Circuits are a time-efficiency structure for low-equipment or short sessions:
three or more exercises rotated with minimal rest.

- Never used for primary strength work.
- Requires that the equipment for every station is simultaneously available.
- Time estimation switches to a round-based model.
- Like supersets, a circuit is one block in the UI and separate durable records per exercise.

## Invariants

1. Generation is pure and deterministic given `(request, catalog, seed)`.
2. Inputs are never mutated.
3. Every returned exercise satisfies the location, equipment, and limitation constraints. There
   is no "close enough" fallback that ignores a limitation.
4. The conflict engine finds no blocking conflict in a generated workout. A generation result
   that fails conflict detection is a generation bug.
5. Exercise order respects role priority: strength before hypertrophy, compound before isolation.
6. Duration changes rebuild; they never truncate.
7. A superset or circuit is one block and N durable records.
8. Warm-up sets are prescribed separately from working sets and are never counted as working
   volume.
9. Generation never reads or writes storage. The caller persists the result.

## Open questions for Phase 3

- Volume targets per muscle group and how they distribute across a training week.
- The rotation window that stops the same session appearing three days running.
- The tolerance band for duration fitting, and whether under-filling or over-filling is preferred.
- How strongly recent poor recovery should bias exercise selection before recalibration is
  involved.

## Testing

Fixtures per duration, location, equipment set, and limitation combination. Snapshot the
generated session for each and assert stability. Property tests: no forbidden exercise ever
appears; estimated duration always lands within tolerance; every generated session passes
conflict detection; the same seed always reproduces the same session.
