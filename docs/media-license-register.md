# Media license register

Every media asset committed to this repository and shipped in the product must appear as a row in
the register below. No row, no commit.

This register is the audit trail. If someone asks where an image came from and whether we are
allowed to redistribute it, the answer must be readable here without archaeology through git
history.

---

## Where we actually stand

> **Real demonstrations shipped: 0.**
> **Exercises showing a generated placeholder: all of them.**

Read that literally. Nothing in `public/media/` demonstrates an exercise. What is committed is 23
original abstract diagrams — one per movement pattern — that show a direction of force against a
body axis. They contain no human figure, deliberately, because a figure would imply we are showing
correct form and we are not.

Phase 2 was never required to ship the final assets; it was required to ship the manifest, this
register, and safe original placeholders, and that is exactly what it ships. But the plan's **final
acceptance requires a working visual demonstration for every production-enabled exercise**, and
nothing in Phase 2 moves that number off zero. Closing the gap is a product decision (see
[Closing the gap](#closing-the-gap)) that has to be made well before Phase 8, because every option
takes real time.

The number is measured, not estimated. `src/catalog/media/mediaManifest.ts` marks every stand-in
record `isPlaceholder: true`, and `summariseMediaCoverage()` counts them against the live catalog.
The test in `src/catalog/media/mediaManifest.test.ts` reports that count on every run today and is
one line away from failing the build on it at Phase 8 — the line to change is documented in the
test.

---

## Hard rules

**Original or verifiably redistributable only.** An asset qualifies if we made it, or if it
carries a licence that explicitly permits redistribution in a public repository and a deployed
web app. "Found on the internet", "no copyright notice", and "it's for education" do not qualify.

**No scraping from commercial fitness apps.** Media may not be taken from Fitbod or any other
commercial fitness product, and may not be extracted from YouTube, Instagram, TikTok, or similar
platforms. Platform terms aside, we do not know what those creators licensed, which means we
cannot verify redistribution — and unverifiable is the same as prohibited here.

**No hotlinking.** Assets are committed to this repository and served from our own origin. Even
if a remote URL were legally fine, linking to it would break offline use, leak a request to a
third party, and violate the local-first constraint. The privacy scan fails the build on any
third-party origin, and that includes an origin that only appears in a `licenceUrl`: a licence
link that has to be recorded goes in the **Notes** column as plain text, not as a fetchable URL,
or it carries an explicit `privacy-scan-allow:external-origin` decision.

**No branding, no watermarks.** Assets must not carry another product's logo, name, UI chrome,
watermark, or visual identity. If an image is recognisably from another app, it does not ship.

**Verification is recorded, not assumed.** Each row states who verified the licence and on what
date. An unverified row is treated as a blocking issue.

**Nothing is committed without a row.** A media file present in the repository but absent from
this table is a defect, and `mediaManifest.test.ts` fails on it — in both directions. It also
fails on an asset listed here that no longer exists on disk, and on a committed file the manifest
never references.

**A placeholder is never presented as a demonstration.** Placeholder assets are marked in the
manifest, counted in this register, and must not be described in UI copy as showing how an
exercise is performed.

---

## Asset conventions

|                               |                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| Real, exercise-specific media | `public/media/<exerciseId>/` — `poster.webp`, `demo.webm` or an animated `demo.webp` |
| Shared placeholder posters    | `public/media/posters/<movementPatternId>.png`                                       |

- Paths inside the manifest are relative to the public root (`media/...`); paths in this register
  are repository paths (`public/media/...`).
- Naming uses the catalog id, never the display name.
- Assets are compressed for mobile; a demonstration clip should be short, silent, and looping.
- Posters carry no baked-in text. The exercise name is drawn by the UI at render time, which keeps
  the assets font-independent and byte-identical when regenerated on another machine.
- Everything under `public/` is precached by the service worker, so the whole media set is paid
  for on install by every user. The placeholder set is budgeted at under 160 KB and that budget is
  asserted in `mediaManifest.test.ts`.

## How the placeholders are made

`node scripts/make-exercise-posters.mjs` regenerates all 23 posters. It reads the canonical
movement-pattern list out of `src/catalog/movementPatterns/movementPatterns.ts` and refuses to run
if a pattern has no drawing, so a new pattern cannot silently ship without a poster. The geometry
is authored as coordinates in the script; it is rendered as inline SVG and rasterised through
Playwright's Chromium, exactly as `scripts/make-icons.mjs` does for the app icons. Nothing is
traced, downloaded, or derived from another work.

The script prints the byte size of every file it wrote, ready to paste into
`PLACEHOLDER_POSTER_BYTES` in the manifest. That table is compared against the files on disk by
the tests, so a stale transcription fails CI rather than shipping a manifest that misreports what
it ships.

---

## Register

**23 assets, 96.8 KB total.** All original, all project-owned, all placeholders.

| Asset                                         | Exercise ID            | Type   | Source                                         | Author            | License                      | Redistribution OK          | Verified on                      | Notes                                                         |
| --------------------------------------------- | ---------------------- | ------ | ---------------------------------------------- | ----------------- | ---------------------------- | -------------------------- | -------------------------------- | ------------------------------------------------------------- |
| public/media/posters/horizontal-push.png      | _(shared placeholder)_ | poster | generated by scripts/make-exercise-posters.mjs | Workout Conductor | original work, project-owned | Yes — we own the copyright | 2026-09-02, Phase 2 media review | Movement pattern `horizontal-push`. Not a demonstration.      |
| public/media/posters/horizontal-pull.png      | _(shared placeholder)_ | poster | generated by scripts/make-exercise-posters.mjs | Workout Conductor | original work, project-owned | Yes — we own the copyright | 2026-09-02, Phase 2 media review | Movement pattern `horizontal-pull`. Not a demonstration.      |
| public/media/posters/vertical-push.png        | _(shared placeholder)_ | poster | generated by scripts/make-exercise-posters.mjs | Workout Conductor | original work, project-owned | Yes — we own the copyright | 2026-09-02, Phase 2 media review | Movement pattern `vertical-push`. Not a demonstration.        |
| public/media/posters/vertical-pull.png        | _(shared placeholder)_ | poster | generated by scripts/make-exercise-posters.mjs | Workout Conductor | original work, project-owned | Yes — we own the copyright | 2026-09-02, Phase 2 media review | Movement pattern `vertical-pull`. Not a demonstration.        |
| public/media/posters/squat.png                | _(shared placeholder)_ | poster | generated by scripts/make-exercise-posters.mjs | Workout Conductor | original work, project-owned | Yes — we own the copyright | 2026-09-02, Phase 2 media review | Movement pattern `squat`. Not a demonstration.                |
| public/media/posters/hinge.png                | _(shared placeholder)_ | poster | generated by scripts/make-exercise-posters.mjs | Workout Conductor | original work, project-owned | Yes — we own the copyright | 2026-09-02, Phase 2 media review | Movement pattern `hinge`. Not a demonstration.                |
| public/media/posters/lunge.png                | _(shared placeholder)_ | poster | generated by scripts/make-exercise-posters.mjs | Workout Conductor | original work, project-owned | Yes — we own the copyright | 2026-09-02, Phase 2 media review | Movement pattern `lunge`. Not a demonstration.                |
| public/media/posters/hip-extension.png        | _(shared placeholder)_ | poster | generated by scripts/make-exercise-posters.mjs | Workout Conductor | original work, project-owned | Yes — we own the copyright | 2026-09-02, Phase 2 media review | Movement pattern `hip-extension`. Not a demonstration.        |
| public/media/posters/carry.png                | _(shared placeholder)_ | poster | generated by scripts/make-exercise-posters.mjs | Workout Conductor | original work, project-owned | Yes — we own the copyright | 2026-09-02, Phase 2 media review | Movement pattern `carry`. Not a demonstration.                |
| public/media/posters/calf-raise.png           | _(shared placeholder)_ | poster | generated by scripts/make-exercise-posters.mjs | Workout Conductor | original work, project-owned | Yes — we own the copyright | 2026-09-02, Phase 2 media review | Movement pattern `calf-raise`. Not a demonstration.           |
| public/media/posters/knee-flexion.png         | _(shared placeholder)_ | poster | generated by scripts/make-exercise-posters.mjs | Workout Conductor | original work, project-owned | Yes — we own the copyright | 2026-09-02, Phase 2 media review | Movement pattern `knee-flexion`. Not a demonstration.         |
| public/media/posters/knee-extension.png       | _(shared placeholder)_ | poster | generated by scripts/make-exercise-posters.mjs | Workout Conductor | original work, project-owned | Yes — we own the copyright | 2026-09-02, Phase 2 media review | Movement pattern `knee-extension`. Not a demonstration.       |
| public/media/posters/hip-abduction.png        | _(shared placeholder)_ | poster | generated by scripts/make-exercise-posters.mjs | Workout Conductor | original work, project-owned | Yes — we own the copyright | 2026-09-02, Phase 2 media review | Movement pattern `hip-abduction`. Not a demonstration.        |
| public/media/posters/hip-adduction.png        | _(shared placeholder)_ | poster | generated by scripts/make-exercise-posters.mjs | Workout Conductor | original work, project-owned | Yes — we own the copyright | 2026-09-02, Phase 2 media review | Movement pattern `hip-adduction`. Not a demonstration.        |
| public/media/posters/isolation-curl.png       | _(shared placeholder)_ | poster | generated by scripts/make-exercise-posters.mjs | Workout Conductor | original work, project-owned | Yes — we own the copyright | 2026-09-02, Phase 2 media review | Movement pattern `isolation-curl`. Not a demonstration.       |
| public/media/posters/isolation-extension.png  | _(shared placeholder)_ | poster | generated by scripts/make-exercise-posters.mjs | Workout Conductor | original work, project-owned | Yes — we own the copyright | 2026-09-02, Phase 2 media review | Movement pattern `isolation-extension`. Not a demonstration.  |
| public/media/posters/isolation-raise.png      | _(shared placeholder)_ | poster | generated by scripts/make-exercise-posters.mjs | Workout Conductor | original work, project-owned | Yes — we own the copyright | 2026-09-02, Phase 2 media review | Movement pattern `isolation-raise`. Not a demonstration.      |
| public/media/posters/isolation-fly.png        | _(shared placeholder)_ | poster | generated by scripts/make-exercise-posters.mjs | Workout Conductor | original work, project-owned | Yes — we own the copyright | 2026-09-02, Phase 2 media review | Movement pattern `isolation-fly`. Not a demonstration.        |
| public/media/posters/shrug.png                | _(shared placeholder)_ | poster | generated by scripts/make-exercise-posters.mjs | Workout Conductor | original work, project-owned | Yes — we own the copyright | 2026-09-02, Phase 2 media review | Movement pattern `shrug`. Not a demonstration.                |
| public/media/posters/rotation.png             | _(shared placeholder)_ | poster | generated by scripts/make-exercise-posters.mjs | Workout Conductor | original work, project-owned | Yes — we own the copyright | 2026-09-02, Phase 2 media review | Movement pattern `rotation`. Not a demonstration.             |
| public/media/posters/anti-extension.png       | _(shared placeholder)_ | poster | generated by scripts/make-exercise-posters.mjs | Workout Conductor | original work, project-owned | Yes — we own the copyright | 2026-09-02, Phase 2 media review | Movement pattern `anti-extension`. Not a demonstration.       |
| public/media/posters/anti-rotation.png        | _(shared placeholder)_ | poster | generated by scripts/make-exercise-posters.mjs | Workout Conductor | original work, project-owned | Yes — we own the copyright | 2026-09-02, Phase 2 media review | Movement pattern `anti-rotation`. Not a demonstration.        |
| public/media/posters/anti-lateral-flexion.png | _(shared placeholder)_ | poster | generated by scripts/make-exercise-posters.mjs | Workout Conductor | original work, project-owned | Yes — we own the copyright | 2026-09-02, Phase 2 media review | Movement pattern `anti-lateral-flexion`. Not a demonstration. |

Column meanings:

- **Asset** — repository path of the committed file.
- **Exercise ID** — the catalog id it belongs to. A placeholder poster is shared by every exercise
  in its movement pattern and therefore belongs to no single id.
- **Type** — poster, demonstration, or icon.
- **Source** — where it came from: "original", or the specific origin with a link.
- **Author** — the creator or rights holder.
- **License** — the exact licence, by name and version.
- **Redistribution OK** — yes / no, and the clause or page that says so.
- **Verified on** — date the licence was checked, and by whom.
- **Notes** — attribution requirements, edits made, or anything a future reader needs.

The app icons in `public/icons/` are generated the same way by `scripts/make-icons.mjs` and are
original project-owned work under the same terms; they are product chrome rather than exercise
media, and the manifest does not cover them.

---

## Closing the gap

This section exists so the decision is made deliberately rather than discovered in Phase 8. All
three options are viable; they differ in cost, in look, and in how much of the catalog they can
cover.

**1. Generated original animation.** Extend the existing generator into short, silent, looping
clips — a jointed 2D figure animated from keyframes authored per movement pattern, rendered to
`demo.webm` the same way the posters are rendered now. Zero licensing risk, zero third-party
dependency, and it scales to the whole catalog at no marginal cost per exercise. It is honest
enough to label as an illustration rather than a demonstration, and it will never look like real
coaching footage. Cost is engineering time in the animation authoring, roughly a phase of work,
concentrated in per-pattern keyframes rather than per-exercise assets.

**2. A licensed pack.** Buy an exercise-illustration or exercise-animation library whose licence
explicitly permits redistribution in a public repository and a deployed web app. This is the only
option that yields recognisable, per-exercise, anatomically credible demonstrations quickly. The
risks are that most fitness-media licences prohibit redistribution in an open repository or
require an attribution surface, that coverage rarely matches a bespoke catalog one-for-one, and
that every asset still needs a register row and a verified licence. Budget both money and review
time, and check the redistribution clause **before** buying, not after.

**3. A smaller production-enabled catalog.** Keep the full catalog for reasoning — the conflict
engine, alternatives, and progression families all still work off the metadata — but set
`productionEnabled: false` on everything without a real demonstration, so the acceptance gate
applies to a set we can actually finish. The product ships with fewer offered exercises and a
larger reserve; the gate stays honest instead of being weakened to accommodate the gap.

**These combine.** The realistic plan is (1) as the floor for the whole catalog, plus (3) to size
the production-enabled set to what has been reviewed, with (2) as an optional upgrade for the
highest-traffic movements if a licence with clean redistribution terms turns up.

**What is not an option:** scraping, hotlinking, "temporarily" shipping an asset whose licence has
not been verified, or relabelling a placeholder as a demonstration to make the gate pass.
