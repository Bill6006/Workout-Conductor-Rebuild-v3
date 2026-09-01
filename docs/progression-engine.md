# Progression engine

**Status: not yet implemented.** This is the agreed contract, written ahead of the work.

- **Owner phase:** Phase 6 — Adaptive Coach, Progression, Strategy, and Recovery
- **Location:** `src/engine/progression/`
- **Consumers:** generation, recalibration, the Adaptive Coach, the progress views

## Purpose

Decide what the user should do next on a given exercise, based on what they have actually done.
The progression engine turns logged history into the next prescription, and it is the only place
that decision is made.

```text
recommendProgression(exerciseId, state, history, context) → ProgressionRecommendation
```

## Tracked fields

Per exercise, the durable `ProgressionState` holds:

| Field                  | Meaning                                                       |
| ---------------------- | ------------------------------------------------------------- |
| `exerciseId`           | Which exercise this state belongs to                          |
| `currentWeight`        | The working load in the user's units                          |
| `currentRepTarget`     | Target reps, or the active rep range                          |
| `currentSetTarget`     | Target working sets                                           |
| `repRange`             | The band the exercise progresses within                       |
| `mode`                 | Active progression mode (below)                               |
| `consecutiveSuccesses` | Sessions meeting the target                                   |
| `consecutiveFailures`  | Sessions missing the target                                   |
| `lastPerformed`        | Timestamp of the last working set                             |
| `lastPrescription`     | What was asked for last time                                  |
| `lastActual`           | What was achieved last time                                   |
| `estimatedOneRepMax`   | Derived, for trend display only — never a prescription source |
| `plateauFlag`          | Whether trend analysis has flagged a stall                    |
| `deloadCount`          | Exercise-level deloads applied                                |
| `lineage`              | Prior exercise ids this state has carried through             |

## Inputs to a recommendation

- The current `ProgressionState` for the exercise.
- Recent `SetRecord` history for it — enough sessions to see a trend, not just the last one.
- Session feedback and recovery state.
- Whether the last sessions were time-constrained, since a short session's reduced volume is not
  a performance signal.
- Any limitation now affecting the movement.
- The user's experience level and goal weighting.

## Supported progression modes

**Double progression** — the default. Add reps within the range at a fixed load; when the top of
the range is reached across all working sets, add load and reset to the bottom of the range.

**Weight progression** — add load when the target is met, holding reps fixed. Used mainly for
primary compound lifts with a clear loading increment.

**Rep progression** — add reps at a fixed load. Used where load increments are impractical
(bodyweight movements, fixed-weight equipment, wide dumbbell jumps).

**Set progression** — add a working set to accumulate volume before load moves. Used where the
next load jump is too large to take in one step.

**Exercise-level deload** — reduce load or volume for this one exercise, not the whole programme.
Triggered by repeated failure or a plateau flag. A deload is a normal, expected event and is
recorded as such, not as a failure.

**Maintain** — hold the current prescription. The correct answer more often than it looks:
constrained sessions, poor recovery, insufficient data, and post-deload consolidation all call
for it.

**Regression after repeated failure** — after sustained inability to meet the target, step the
prescription back to a level that can be completed. Requires a genuine trend, never one session.

**Alternative progression continuity** — when an exercise is substituted, the replacement
inherits the progression state where the movements are comparable, with load mapped by the
catalog's equivalence metadata. The `lineage` field records the chain so the user's progress
survives a swap instead of resetting to zero. Where movements are not comparable, continuity is
declined explicitly rather than faked.

## The core rule: do not punish one poor set

**A single poor set never drives a recommendation. Trends do.**

One bad set means the user slept badly, ate late, trained after work, or simply had an off day.
Reacting to it — dropping load, flagging a plateau, triggering a deload — makes the app feel
punitive and, worse, makes it wrong. Recommendations require a signal across multiple sessions:
consecutive counters, a trend over a rolling window, and corroborating context.

The same restraint applies upward. One unusually strong set is not proof of readiness for a jump.

Corollaries:

- Missing the target once → `maintain`, no state change beyond the counter.
- A time-constrained session that logged fewer sets is not a failure and does not increment the
  failure counter.
- A session logged under a newly reported limitation is excluded from trend analysis for that
  movement.
- A deload never follows a single session.

## Warm-up sets are excluded — everywhere

A set marked as a warm-up is excluded from:

- progression decisions and the success/failure counters
- plateau detection and trend analysis
- personal records of every kind
- working-set totals, per-session and per-week volume
- estimated one-rep-max calculations

Warm-ups are recorded because the user did them and may want to see them, and because repeating a
familiar warm-up ramp is useful. They are not performance data. Counting them inflates volume,
corrupts trends, and produces PRs that never happened. Every query that feeds progression filters
on `isWarmup === false`, and this is asserted in tests rather than assumed.

## Outputs

`ProgressionRecommendation`:

- `mode` — the mode applied
- `nextPrescription` — sets, reps or rep range, load, RIR target
- `delta` — what changed relative to last time
- `confidence` — how much history supports this
- `rationale` — a short explanation, suitable for the Adaptive Coach
- `stateUpdate` — the new `ProgressionState` to persist

## Invariants

1. Pure and deterministic; no storage, no clock, no network.
2. Warm-up sets never influence progression, plateaus, PRs, or volume.
3. No recommendation is driven by a single set or a single session.
4. Progression never rewrites history — it only proposes what comes next.
5. Insufficient history yields `maintain` with low confidence, never a guess.
6. A deload is a recorded, explainable event, not a silent reduction.
7. Substituted exercises inherit progression only where the catalog says the movements are
   comparable.
8. Every recommendation carries a rationale the user could read.

## Open questions for Phase 6

- The trend window length, and whether it is measured in sessions or in weeks.
- Load increment tables per equipment type and per user unit preference.
- The plateau threshold, and how it differs between compounds and isolation work.
- Whether estimated one-rep-max should be surfaced at all, given how badly it is usually misread.

## Testing

History fixtures spanning many sessions per mode. Explicit regression tests for the two rules
most likely to be broken by a later change: a single failed set must not alter the prescription,
and a warm-up set must not appear in any volume, PR, or trend calculation.
