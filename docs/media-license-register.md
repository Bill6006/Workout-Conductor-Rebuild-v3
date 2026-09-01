# Media license register

Every media asset committed to this repository and shipped in the product must appear as a row in
the table below. No row, no commit.

This register is the audit trail. If someone asks where an image came from and whether we are
allowed to redistribute it, the answer must be readable here without archaeology through git
history.

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
third party, and violate the local-first constraint.

**No branding, no watermarks.** Assets must not carry another product's logo, name, UI chrome,
watermark, or visual identity. If an image is recognisably from another app, it does not ship.

**Verification is recorded, not assumed.** Each row states who verified the licence and on what
date. An unverified row is treated as a blocking issue.

**Nothing is committed without a row.** A media file present in the repository but absent from
this table is a defect, and the Phase 2 media test is expected to catch it.

## Phase 2 obligations

Phase 2 creates `src/catalog/mediaManifest.ts`, mapping each exercise to its media assets.

An automated test must fail the build if **any production-enabled exercise lacks both a poster
image and a demonstration asset**. A catalog entry with `productionEnabled: true` and missing
media is a broken exercise card in front of a real user, so it is caught in CI rather than in
review. Exercises that are not production-enabled are exempt and must be flagged as such in the
catalog, not quietly skipped by the test.

The same test should assert the inverse direction: every asset referenced by the manifest exists
on disk, and every asset on disk is referenced by the manifest.

## Asset conventions

- Location: `public/media/<exerciseId>/`
- Poster: `poster.webp` — a single representative still
- Demonstration: `demo.webm` or an animated `demo.webp`
- Naming uses the exercise id, never the display name.
- Assets are compressed for mobile; a demonstration clip should be short, silent, and looping.

## Register

_No media assets are committed yet._ Phase 0 ships the shell only; the catalog and its media
arrive in Phase 2. The table below is the template every future asset fills in.

| Asset    | Exercise ID | Type | Source | Author | License | Redistribution OK | Verified on | Notes |
| -------- | ----------- | ---- | ------ | ------ | ------- | ----------------- | ----------- | ----- |
| _(none)_ | —           | —    | —      | —      | —       | —                 | —           | —     |

Column meanings:

- **Asset** — repository path of the committed file.
- **Exercise ID** — the catalog id it belongs to.
- **Type** — poster, demonstration, or icon.
- **Source** — where it came from: "original", or the specific origin with a link.
- **Author** — the creator or rights holder.
- **License** — the exact licence, by name and version.
- **Redistribution OK** — yes / no, and the clause or page that says so.
- **Verified on** — date the licence was checked, and by whom.
- **Notes** — attribution requirements, edits made, or anything a future reader needs.
