# Conflict engine

**Status: not yet implemented.** This is the agreed contract, written ahead of the work.

- **Owner phase:** Phase 2 — Exercise Catalog, Media, and Conflict Engine
- **Location:** `src/engine/conflicts/`
- **Consumers:** generation (Phase 3), recalibration (Phase 4), alternatives, the active workout

## Purpose

Given a proposed session — or a proposed change to one — report every structural problem with it.
The conflict engine does not fix anything and does not choose anything. It detects, classifies,
and explains. Generation and recalibration decide what to do about the report.

Separating detection from resolution keeps the rules in one place. Without it, "don't put two
horizontal presses back to back" ends up encoded three times with three different definitions.

## Detection is metadata-driven, never name-driven

**Conflicts are detected from structured exercise metadata. Exercise names are never compared,
matched, parsed, or fuzzy-matched.**

This is the single most important rule in this document. Name matching looks like it works —
"Barbell Bench Press" and "Dumbbell Bench Press" both contain "Bench Press" — right up until it
matches "Leg Press" with "Bench Press", misses that "Chest Fly" and "Pec Deck" are the same
movement, and breaks entirely for any custom exercise a user names themselves.

Every exercise in the catalog carries the metadata detection needs: movement pattern, primary and
secondary muscles, joint loading, grip type and orientation, equipment requirements, station,
plane of motion, unilateral flag, and progression role. If a conflict cannot be detected from
metadata, the fix is to add the missing metadata field to the catalog schema — never to fall back
on the name.

## Inputs

| Input              | Meaning                                              |
| ------------------ | ---------------------------------------------------- |
| `workout`          | The proposed session, ordered, with prescriptions    |
| `catalog`          | Exercise metadata for everything referenced          |
| `completedWork`    | What has already been logged this session            |
| `equipment`        | What is actually available right now                 |
| `location`         | The active location profile                          |
| `limitations`      | Injuries and restricted movements                    |
| `recovery`         | Per-muscle recovery state and readiness              |
| `timeBudget`       | Target session duration and time already elapsed     |
| `progressionState` | Per-exercise progression, for role-continuity checks |

## Outputs

A list of `Conflict` records, each with:

- `type` — one of the detected types below
- `severity` — `blocking`, `warning`, or `informational`
- `subjects` — the exercise or exercises involved, by id
- `explanation` — a short, plain sentence a user could read
- `suggestedResolution` — a hint for the resolving engine, not an action

A workout with any `blocking` conflict is not a valid workout. Generation must not return one and
recalibration must not apply one.

## Detected conflict types

**`duplicate-movement-pattern`** — two exercises train the same pattern (horizontal press,
vertical pull, hip hinge, knee-dominant squat, …) without justification. Detected from the
`movementPattern` field.

**`duplicate-exercise`** — the same exercise id appears twice in one session outside a deliberate
structure such as a circuit round.

**`same-muscle-overlap`** — excessive primary-muscle overlap across the session, pushing one
group past its per-session volume ceiling while another is untouched. Uses primary and secondary
muscle contributions, not exercise identity.

**`joint-stress`** — cumulative loading on one joint (lumbar spine, knees, shoulders, elbows)
beyond what the session or the user's limitations support. Uses per-exercise joint-load metadata.

**`grip`** — grip-limited exercises stacked such that forearm fatigue, not the target muscle,
becomes the limiter. Detected from grip type and grip demand.

**`equipment`** — an exercise requires equipment that the active location profile does not have,
or that is currently marked unavailable.

**`station`** — two exercises need the same physical station at the same time, or a superset pairs
two exercises across stations too far apart to alternate between.

**`superset`** — an invalid pairing: shared station, incompatible equipment, a fatigue interaction
that ruins the second movement, or a pair where one exercise is a primary strength lift.

**`recovery`** — an exercise targets a muscle group still under-recovered from recent training,
at an intensity the recovery state does not support.

**`time`** — the session's estimated duration exceeds the time budget, or the remaining work
cannot fit in the time left.

**`limitation`** — an exercise is contraindicated by a recorded injury or restriction. Always
`blocking`. There is no severity at which a limitation is overridden.

**`location`** — an exercise is not viable at the active location, independent of equipment
(space, noise, ceiling height, flooring).

**`progression-role`** — a change would break progression continuity: replacing an exercise that
carries an active progression with one that cannot inherit it, or removing the only exercise
filling a required session role.

## Invariants

1. Detection is pure and deterministic. No storage, no clock, no network.
2. No conflict is ever detected by comparing exercise names.
3. The engine reports; it never mutates the workout and never chooses a resolution.
4. Every conflict carries an explanation a user could read without training jargon.
5. Limitation conflicts are always `blocking`.
6. A workout returned by generation contains zero blocking conflicts.
7. A custom exercise with complete metadata is checked exactly like a catalog exercise.
8. Detection cost is bounded by session size, not catalog size — a session is small; scanning the
   whole catalog on every check is a design error.

## Open questions for Phase 2

- Per-session and per-week volume ceilings by muscle group, and where the warning threshold sits.
- The joint-load scale and how per-exercise values are assigned consistently.
- Whether `duplicate-movement-pattern` is ever legitimate (deliberate high-frequency programming)
  and how that intent is expressed.
- How much metadata a custom exercise must supply before it can be scheduled at all.

## Testing

A fixture session per conflict type, asserting both detection and non-detection — the false
positives matter as much as the misses. An explicit adversarial suite for the name-matching rule:
exercises with confusingly similar names and different metadata must **not** conflict, and
exercises with different names and identical metadata **must**.
