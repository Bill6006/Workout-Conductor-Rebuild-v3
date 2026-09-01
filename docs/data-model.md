# Data model

**Status: not yet implemented.** No schemas, no database, and no persistence exist today. This is
the agreed shape, written ahead of the work.

- **Owner phases:** Phase 1 (storage foundation), Phase 8 (backup, restore, migration)
- **Location:** `src/core/schemas/` for Zod schemas, `src/core/types/` for derived types,
  `src/engine/storage/` for the IndexedDB layer

Every entity below is defined as a Zod schema first; TypeScript types are inferred from the
schemas, never hand-written alongside them. Data crossing a storage or import boundary is
**parsed, not cast**.

## Durable entities

### Profile

The single user profile. One record.

`id`, `schemaVersion`, `units` (metric | imperial), `experienceLevel`, `goalWeighting`
(strength ↔ hypertrophy), `defaultDurationMinutes`, `trainingDaysPerWeek`, `bodyweight`
(optional), `limitations[]`, `preferences` (liked and disliked exercise ids, preferred patterns),
`createdAt`, `updatedAt`.

No name, no email, no date of birth, no contact details. The app never asks for identity.

### LocationProfile

A place the user trains. Several per user.

`id`, `schemaVersion`, `label` (user-supplied, e.g. "Home garage"), `type`
(gym | home | travel | outdoor), `equipmentProfileId`, `spaceConstraints`, `noiseConstraints`,
`isDefault`, `createdAt`, `updatedAt`.

### EquipmentProfile

What is available at a location.

`id`, `schemaVersion`, `label`, `items[]` — each with `equipmentType`, `available`,
`quantity`, `loadRange` (min, max, increment) and optional `stationId` — plus `updatedAt`.

`loadRange` is what lets progression propose a load that actually exists on the rack.

### Exercise

A catalog exercise. Ships with the app; read-only at runtime.

`id`, `schemaVersion`, `name`, `movementPattern`, `primaryMuscles[]`, `secondaryMuscles[]`,
`equipmentRequired[]`, `stationId`, `jointLoads` (joint → load level), `gripType`,
`gripDemand`, `plane`, `unilateral`, `progressionRole`, `defaultRepRange`, `defaultRestSeconds`,
`timeCostSeconds`, `difficulty`, `contraindications[]`, `equivalentExercises[]` (for progression
continuity), `mediaId`, `cues[]`, `productionEnabled`.

Every field the conflict engine needs is here, because conflict detection never reads the name.

### CustomExercise

A user-created exercise. Same metadata shape as `Exercise`, plus `isCustom: true`, `createdAt`,
and `basedOnExerciseId` (optional). Stored in IndexedDB rather than shipped. A custom exercise
without complete metadata may be logged manually but cannot be scheduled by generation.

### Workout

One session, planned or completed.

`id`, `schemaVersion`, `status` (planned | active | completed | abandoned), `scheduledFor`,
`startedAt`, `completedAt`, `locationProfileId`, `requestedDuration` (15 | 30 | 45 | default),
`resolvedDurationMinutes`, `estimatedDurationMinutes`, `actualDurationMinutes`, `exercises[]`
(`WorkoutExercise`), `generationSeed`, `generationRequestSnapshot`, `recalibrationLog[]`,
`sessionFeedbackId`, `notes`.

`generationSeed` and `generationRequestSnapshot` make any historical session reproducible from a
bug report. `recalibrationLog` records each mid-session rebuild: trigger, timestamp, and the diff.

### WorkoutExercise

One exercise within a session.

`id`, `workoutId`, `exerciseId`, `order`, `role` (primary strength | secondary strength | primary
hypertrophy | accessory | corrective), `prescription` (target sets, rep range, target load, RIR
target, rest seconds), `blockId` and `blockType` (straight | superset | circuit), `blockPosition`,
`status` (pending | active | completed | skipped), `locked`, `substitutedFrom` (optional).

**A superset is one block in the UI and two `WorkoutExercise` records in storage.** Members share
a `blockId`; everything downstream — progression, volume, PRs — sees two ordinary exercises.

### SetRecord

The atomic unit of history. Immutable once written.

`id`, `workoutId`, `workoutExerciseId`, `exerciseId`, `setNumber`, `isWarmup`, `isDropSet`,
`parentSetId` (for drop sets), `weight`, `reps`, `rir`, `tempo` (optional), `completedAt`,
`durationSeconds`, `notes`, `prescribedWeight`, `prescribedReps`.

`isWarmup` is load-bearing. Warm-up sets are excluded from progression, plateau detection, PRs,
and working-set volume — see [the progression engine](./progression-engine.md). Keeping the
prescribed values alongside the actual ones is what makes performance deviation measurable
without recomputing history.

Recalibration may never modify a `SetRecord`.

### SessionFeedback

How the session went, captured at the end.

`id`, `workoutId`, `perceivedEffort`, `energyLevel`, `soreness` (per muscle group), `sleepQuality`,
`stressLevel`, `enjoyment`, `notes`, `recordedAt`. All optional; the summary never blocks on it.

### PersonalRecord

`id`, `exerciseId`, `type` (max weight | max reps at weight | max estimated 1RM | max volume |
best set), `value`, `weight`, `reps`, `achievedAt`, `workoutId`, `setRecordId`,
`previousValue`.

PRs derive from working sets only. A PR is never revoked by recalibration and never edited by an
engine.

### ProgressionState

Per-exercise progression, as specified in [the progression engine](./progression-engine.md):
`exerciseId`, `currentWeight`, `currentRepTarget`, `currentSetTarget`, `repRange`, `mode`,
`consecutiveSuccesses`, `consecutiveFailures`, `lastPerformed`, `lastPrescription`, `lastActual`,
`estimatedOneRepMax`, `plateauFlag`, `deloadCount`, `lineage[]`, `updatedAt`.

### BackupEnvelope

The export format. One file, self-describing.

`formatVersion`, `appVersion`, `schemaVersion`, `exportedAt`, `checksum`, `counts` (per entity),
`data` (every durable entity keyed by store name).

`counts` and `checksum` exist so a restore can verify it received everything before it writes
anything.

## Schema versioning and unknown fields

Every persisted record carries `schemaVersion`.

**Unknown fields are preserved, not stripped.** When a record read from storage contains fields
the current schema does not know about — because a newer build wrote it, or because a migration
is mid-flight — those fields are carried through unchanged on write. Zod schemas use passthrough
semantics on durable entities for exactly this reason. Stripping unknown fields turns "open the
app on an older build" into permanent, silent data loss.

Migration rules:

- Migrations are ordered, versioned, and forward-only.
- Each migration is a pure function from version _n_ to version _n+1_, unit tested with fixtures.
- Migration writes into the new version alongside the old data, verifies, and only then switches.
- If a migration fails, the previous data remains readable by the previous build.
- A record from a _newer_ schema version than the running build is not migrated backwards. It is
  left untouched and reported, rather than partially interpreted.

## Backup, restore, and rollback

**Backup.** User-initiated export of a `BackupEnvelope` as a JSON file, downloaded to the device.
No upload, no cloud target, no sharing service.

**Restore.** A staged operation, never a blind overwrite:

1. Parse the file against the envelope schema. Reject clearly on failure.
2. Verify the checksum and per-entity counts against the payload.
3. Run any migrations needed to bring it to the current schema version.
4. Snapshot the existing database first.
5. Write into a staging area, read back, and verify.
6. Switch over atomically.
7. Report what was restored, per entity, with counts.

**Rollback.** If any step after the snapshot fails, the snapshot is restored and the user is told
what happened. A failed restore must leave the user exactly where they started. There is no state
in which a restore attempt destroys existing history.

**Write → read back → verify** applies to every critical write, not only restore: completing a
set, finishing a workout, and applying a migration all read back what they wrote before reporting
success.

## Storage placement

| Data                                                | Where        |
| --------------------------------------------------- | ------------ |
| Workouts, sets, PRs, progression, feedback          | IndexedDB    |
| Profiles, locations, equipment, custom exercises    | IndexedDB    |
| Theme, units, last location, active-session pointer | localStorage |
| Anything on screen right now                        | React state  |

`localStorage` holds small settings and active-session metadata only. It never holds history, and
it never holds a list that can grow without bound.

## Invariants

1. Every durable record carries `schemaVersion`.
2. Unknown fields survive a read/write round trip.
3. `SetRecord` is immutable once written.
4. Warm-up sets are excluded from progression, PRs, and volume totals.
5. Every boundary read is parsed with Zod, never cast.
6. Critical writes are read back and verified.
7. A failed restore or migration leaves prior data intact and readable.
8. No entity contains identifying personal data.
