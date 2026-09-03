# Phase 2 — Exercise Catalog, Media, and Conflict Engine

**Status: GREEN — approved by the owner on 2026-09-02.**

|              |                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| Live app     | https://bill6006.github.io/Workout-Conductor-Rebuild-v3/                                             |
| Build marker | `phase2-7-248fd81`                                                                                   |
| Commit       | [`248fd81`](https://github.com/Bill6006/Workout-Conductor-Rebuild-v3/commit/248fd81)                 |
| Workflow run | [run 33644512533](https://github.com/Bill6006/Workout-Conductor-Rebuild-v3/actions/runs/33644512533) |

## Scope

Give the app something to reason about. Phase 3 cannot generate a workout until there is a
structured catalog to choose from, a vocabulary of muscles and movement patterns to reason
in, and a conflict engine that can say why two exercises should not sit in the same session.

No workout is generated in this phase. Nothing on Today changes.

## Delivered

**The vocabulary.** 30 muscle ids rolling up into 13 groups, with an explicit region axis so
Phase 7's weekly-volume work has a rollup to read rather than infer. 23 movement patterns
carrying plane, chain, and a symmetric overlap relation. Ordered scales for difficulty, grip,
and stability, so comparisons are real comparisons rather than string guesses. Joint-stress
tags carry an intensity, so the conflict engine can judge accumulation rather than mere
presence.

**The exercise catalog** — 127 exercises across chest and back, legs and core, and shoulders
and arms. Every entry carries the full metadata set: muscles, pattern, training role,
strength and hypertrophy suitability, equipment, location suitability, setup time and
transition cost, rep range and rep unit, drop-set safety, superset compatibility with its
station, unilateral and compound flags, stability and grip demand, joint-stress tags,
contraindications, per-joint considerations, substitutions, instruction steps, common
mistakes, difficulty, media reference, progression family, and a load model.

**Metadata later phases were promised.** The load model records whether a lift is measured
per-hand or total, whether it uses a bar, and whether plate math applies — which is what
Phase 5's Plate Math helper will read. Every exercise declares warm-up ramp suitability.
Superset compatibility names the station, whether the exercise is grip-heavy, and what it
competes for.

**The conflict engine** — one reusable system detecting duplicate exercises and patterns,
same-muscle overlap, accumulated joint stress, grip, equipment, station, superset, recovery,
time, limitation, location, and progression-role conflicts. Each conflict carries a kind, a
severity, the exercises involved, and a plain-language reason a UI can render verbatim.
Detection reads structured metadata only — never exercise names.

**The alternatives ranking foundation** — pure scoring and filtering over the ranking factors
the plan names, with the excluded cases as hard filters rather than score penalties. Each
result carries what the Phase 5 UI must display: match score, primary reason, key difference,
equipment, setup time, whether progression is preserved, and whether a superset breaks.
"No safe alternative exists" is a distinct, explained outcome rather than an empty list.

**Catalog-backed exercise preferences.** Setup and Settings now pick real exercises from a
searchable list instead of typing free text. The catalog loads lazily, when the picker opens
or when a saved profile has ids that need real names.

**Schema v2 and the migration.** Phase 1 stored preferred and disliked exercises as free text
because no catalog existed. The profile is now v2, holding matched exercise ids alongside
free text. The migration matches conservatively — exact name and alias only, after
normalising case and punctuation — and anything it cannot confidently match stays as free
text, verbatim. A wrong match silently changes what someone asked for, which is worse than no
match, so near-misses are deliberately left alone. Carried-over free text stays visible and
editable in Settings, with an affordance to swap it for a catalog exercise.

**Media infrastructure** — the manifest, the licensing register, and 23 original
movement-pattern posters generated from data by `scripts/make-exercise-posters.mjs`
(152 KB total). Every manifest entry carries required provenance, and placeholders are
explicitly flagged so a Phase 8 acceptance test can find every exercise still lacking a real
demonstration in one query.

## Not in scope

- Workout generation, duration fitting, the working 15/30/45/Default dropdown (Phase 3).
- The recalibration engine and the calibration overlay (Phase 4).
- The alternatives UI, set logger, rest timer, supersets on screen (Phase 5).
- Progression, recovery, Adaptive Coach (Phase 6). Analytics and PRs (Phase 7).
- Real exercise demonstrations — see the decision below.

## Tests

| Gate                            | Result                                  |
| ------------------------------- | --------------------------------------- |
| `npm run lint`                  | pass — 0 errors, 0 warnings             |
| `npm run typecheck`             | pass — app, node, and e2e projects      |
| `npm test` (Vitest)             | pass — 1429 tests, 83 files             |
| `npm run build`                 | pass                                    |
| `npm run privacy:scan`          | pass — source, lockfile, and bundle     |
| `npm run verify:build`          | pass — 11 of 11 checks                  |
| `npm run test:e2e` (Playwright) | pass — 150 tests, 3 projects, no flakes |

Unit tests grew from 606 to 1429. The largest addition is a catalog-integrity suite that
validates every entry against the schema, resolves every cross-reference, and asserts the
coaching metadata is coherent rather than merely present.

## Performance and bundle

The catalog is large data, so the hard requirement this phase was that it must not reach the
boot chunk.

| Metric                                                | Value                               |
| ----------------------------------------------------- | ----------------------------------- |
| Entry payload (gzipped)                               | ~115 KB — unchanged from Phase 1    |
| Exercise catalog                                      | its own 40.3 KB gzipped lazy chunk  |
| Cold first visit, pessimistic (4x CPU, 1.6 Mbps)      | 1809 ms median of 5 (Phase 1: 1762) |
| Cold first visit, mid-range Android (2x CPU, 10 Mbps) | 550 ms median of 5 (Phase 1: 542)   |

The boot chunk was checked directly for exercise ids and catalog field names; none appear. A
test now fails the build if catalog data ever reaches it, because this is exactly the kind of
regression that creeps back through an innocent-looking import.

## Screenshots

Captured from the real running build. See [docs/screenshots/phase-2/](../screenshots/phase-2/)
— 40 files covering all eight setup steps and all five tabs at 360x800 and 412x915 (Android)
and 1280x900 (desktop), plus a contact sheet.

## Verified on the deployed site

Checked against the live URL after deployment, on a Pixel-class Android profile
(360x800, DPR 3, mobile user agent):

- A first visit lands on setup; completing it lands on Today.
- Settings opens the exercise picker and it lists real catalog entries.
- The catalog arrives as a **separate chunk fetched on demand**, confirmed from the
  browser's own resource timings — the lazy split works in production, not just in the
  local build output.
- No console errors and no page errors across the tour.
- Build marker `phase2-7-248fd81 · build 248fd81 · 2026-09-02 14:49 UTC`, matching the
  deployed commit.

## Defects found and fixed during the phase

The catalog-integrity suite earned its place immediately by finding three real data bugs:

- **Three progression families mixed incompatible loading.** `hip-thrust` held a barbell hip
  thrust beside a bodyweight glute bridge; `shrug` held a total-load barbell shrug beside a
  per-hand dumbbell shrug; `horizontal-press-machine` held a Smith bar beside a selectorised
  stack. Progression is supposed to carry across a family, so each of these would have
  handed someone a working weight that silently doubled, halved, or included a bar that was
  not there. Split into loading-consistent families.
- **Two plate-loaded bar lifts were marked safe for drop sets** — a Smith bench press and a
  T-bar row. A drop set on either means stripping plates alone mid-set, which fails both the
  safety test and the plan's "setup is simple" test. Corrected.
- **A station claim without the equipment to back it.** This one was the test being too
  strict rather than the data: a standing overhead press lists the rack as optional because
  it can be cleaned from the floor, but it still occupies the rack when one is used. The
  check now counts optional equipment, because a missed station contention sends someone
  across the gym mid-superset.

Two more in the alternatives engine, found by an order-independence test:

- **The excluded list was returned in candidate-iteration order**, so two catalogs holding
  the same exercises in a different file order produced differently ordered results. Now
  sorted, which makes the whole result a pure function of its inputs.
- **The "no safe alternative" reason broke ties on map insertion order**, while its own doc
  comment promised a canonical order. Fixing the first bug exposed it: the message a user
  sees could change because of an unrelated catalog edit. There is now an explicit priority
  order, most actionable cause first, with a test that fails if a future reason is left out.

And one product defect: the Settings preference row rendered a humanised id rather than the
catalog name, so `barbell-romanian-deadlift` displayed as "Barbell romanian deadlift". The
catalog now also loads when a saved profile has ids that need real names — a profile with no
saved ids still costs nothing.

## A decision you need to make: exercise demonstrations

Final acceptance requires a working visual demonstration for **every** production-enabled
exercise. Right now that count is **zero of 127** — Phase 2 shipped the manifest, the
register, the provenance rules, and pattern-level placeholder posters, which is what the plan
asked of this phase. But nothing here moves the demonstration count off zero, and each route
forward costs real calendar time. This should not be discovered in Phase 8.

1. **Generated original animation.** Extend the poster generator into short, silent, looping
   clips — a jointed figure animated from keyframes authored per movement pattern, roughly 23
   keyframe sets rather than 127 assets. No licensing risk, no third-party dependency, scales
   to the whole catalog at no marginal cost, and is honest as an illustration rather than a
   demonstration of a real person. Cost: roughly a phase of engineering.
2. **A licensed pack.** The only quick route to recognisable, anatomically credible
   per-exercise footage. Risks: most fitness-media licences prohibit redistribution from a
   public repository or demand an attribution surface, coverage rarely matches a bespoke
   catalog one-for-one, and every asset still needs a verified register row. The
   redistribution clause has to be checked before purchase, not after.
3. **A smaller production-enabled catalog.** Keep all 127 for reasoning — conflicts,
   alternatives, and progression families all work off metadata — but mark exercises without
   a real demonstration as not production-enabled, so the gate applies to a set that can
   actually be finished.

My recommendation is (1) as the floor for the whole catalog, with (3) as the honest fallback
if time runs short, because it shrinks the promise rather than weakening the gate. (2) is
worth it only if a licence with clean redistribution terms appears.

## How this phase was verified, and what was not done

The four-lens adversarial review that ran in Phases 0 and 1 **did not run for Phase 2** — the
review agents were lost twice to authentication and session limits. I verified this phase
directly instead: the full CI gate, the catalog-integrity suite, an order-independence check
of the ranking engine, a direct inspection of the boot chunk for catalog data, and the
startup measurements above. Every defect listed in the section above was found and fixed that
way.

That is a weaker net than Phases 0 and 1 had, and it is worth saying plainly. The catalog is
127 entries of coaching judgement, and while the automated suite checks that the metadata is
internally coherent, it cannot tell you whether the coaching itself is right. **The most
valuable thing you could do at this gate is spot-check a handful of exercises you know well**
— their muscles, joint-stress flags, rep ranges, and cues — and tell me if anything reads
wrong. If you would rather I run the adversarial catalog-quality review before you decide,
say so and I will.

## Known limitations

- No exercise has a real demonstration yet; posters are pattern-level placeholders.
- Exercise preference matching is deliberately conservative, so a typed entry that was nearly
  a match stays free text rather than being guessed at.
- The conflict and alternatives engines are complete as pure functions, but nothing in the
  product calls them yet. Phase 3 wires them into generation and Phase 5 into the UI.
- Custom exercises and custom media have schemas but no authoring UI; that arrives with the
  surfaces that need it.

## Review decision

The owner reviews the live app and records one of `GREEN - NEXT PHASE`,
`YELLOW - FIX: <issue>`, or `RED - STOP`. This phase does not advance itself.

**Decision:** `GREEN - NEXT PHASE`

**Reviewed by:** the project owner, on the deployed Pages build

**Date:** 2026-09-02

**Notes:** Approved without change requests. The exercise-demonstration decision above
remains open and is carried forward to Phase 8. Phase 3 — Workout Generation and Duration
Engine — follows.
