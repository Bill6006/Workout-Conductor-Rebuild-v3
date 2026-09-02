import { z } from 'zod'
import { EXERCISE_ID_PATTERN } from '../exercises/exerciseId'

/**
 * THE production-media contract.
 *
 * This file defines the shape of a manifest entry. It holds no manifest DATA and
 * no assets — those belong to the media work, which fills this shape in.
 *
 * PROVENANCE IS NOT OPTIONAL, AND THAT IS THE POINT. `docs/media-license-register.md`
 * says "no row, no commit"; a schema where provenance could be omitted would let
 * an asset be added and the row written later, which is exactly how a repository
 * ends up with media nobody can account for. Provenance sits on the ASSET rather
 * than on the entry because two assets for one exercise can genuinely have
 * different sources, and a per-entry block would force one of them to be
 * described wrongly.
 *
 * USER-OWNED MEDIA IS A DIFFERENT TYPE, IN A DIFFERENT MODULE (`catalog/custom`).
 * It carries no licence, because the user holds the rights; it is never shipped,
 * never committed, and never mixed into this manifest. Keeping them as two types
 * rather than one type with an `isCustom` flag is what stops a user's phone video
 * being treated as something the product may redistribute.
 */

const assetPathSchema = z
  .string()
  .min(1)
  .max(200)
  /** A repository-relative path under the public media root. Never a URL. */
  .regex(/^media\/[a-z0-9][a-z0-9/-]*\.[a-z0-9]+$/, 'An asset path is relative, under media/')

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date')

export const MEDIA_KINDS = ['poster', 'demonstration', 'icon'] as const
export type MediaKind = (typeof MEDIA_KINDS)[number]
export const mediaKindSchema = z.enum(MEDIA_KINDS)

/**
 * Where an asset came from and what we are allowed to do with it.
 *
 * `source` is "original" or a specific, checkable origin. "Found online" and
 * "no copyright notice" are not origins, which is why this is free text a human
 * reviews rather than an enum that could be satisfied by picking a value.
 */
export const mediaProvenanceSchema = z.strictObject({
  /** "original", or the specific origin, with a link where one exists. */
  source: z.string().min(1).max(300),
  /** The creator or rights holder. */
  author: z.string().min(1).max(160),
  /** The exact licence, by name and version. "None" is not a licence. */
  licence: z.string().min(1).max(160),
  licenceUrl: z.string().max(300).nullable(),
  /** Whether the licence permits redistribution in a public repo and a deployed app. */
  redistributionPermitted: z.boolean(),
  /** The date the licence was checked. */
  verifiedOn: isoDateSchema,
  /** Who checked it. An unverified row is a blocking issue. */
  verifiedBy: z.string().min(1).max(120),
  /** Attribution requirements, edits made, anything a future reader needs. */
  notes: z.string().max(500).default(''),
})

export type MediaProvenance = z.infer<typeof mediaProvenanceSchema>

export const mediaAssetSchema = z.strictObject({
  path: assetPathSchema,
  kind: mediaKindSchema,
  /** An image or video type we serve ourselves. No remote origins, ever. */
  mimeType: z.enum(['image/webp', 'image/png', 'video/webm', 'video/mp4']),
  width: z.number().int().min(1).max(8000),
  height: z.number().int().min(1).max(8000),
  byteSize: z.number().int().min(1),
  /** Playback length for a clip; `null` for a still. */
  durationMs: z.number().int().min(1).max(120000).nullable(),
  provenance: mediaProvenanceSchema,
})

export type MediaAsset = z.infer<typeof mediaAssetSchema>

/**
 * One exercise's media. A poster is required; demonstrations may be several (a
 * front and a side angle) or, for an exercise that is not production-enabled,
 * none.
 */
export const mediaManifestEntrySchema = z
  .strictObject({
    exerciseId: z.string().min(1).max(80).regex(EXERCISE_ID_PATTERN),
    poster: mediaAssetSchema,
    demonstrations: z.array(mediaAssetSchema).max(4),
  })
  .superRefine((entry, ctx) => {
    if (entry.poster.kind !== 'poster') {
      ctx.addIssue({ code: 'custom', path: ['poster'], message: 'The poster asset must be kind "poster"' })
    }

    entry.demonstrations.forEach((asset, index) => {
      if (asset.kind !== 'demonstration') {
        ctx.addIssue({
          code: 'custom',
          path: ['demonstrations', index],
          message: 'A demonstration asset must be kind "demonstration"',
        })
      }
      if (asset.durationMs === null) {
        ctx.addIssue({
          code: 'custom',
          path: ['demonstrations', index],
          message: 'A demonstration asset must state its duration',
        })
      }
    })

    for (const [index, asset] of [entry.poster, ...entry.demonstrations].entries()) {
      if (!asset.provenance.redistributionPermitted) {
        ctx.addIssue({
          code: 'custom',
          path: index === 0 ? ['poster'] : ['demonstrations', index - 1],
          message: `${asset.path} may not be redistributed, so it may not ship`,
        })
      }
    }
  })

export type MediaManifestEntry = z.infer<typeof mediaManifestEntrySchema>

export const mediaManifestSchema = z.array(mediaManifestEntrySchema)
export type MediaManifest = z.infer<typeof mediaManifestSchema>

/** The entry for an exercise, or null. Manifests are small; a scan is honest. */
export function mediaEntryFor(manifest: MediaManifest, exerciseId: string): MediaManifestEntry | null {
  return manifest.find((entry) => entry.exerciseId === exerciseId) ?? null
}

/** Every asset an entry references, poster first. */
export function assetsOf(entry: MediaManifestEntry): MediaAsset[] {
  return [entry.poster, ...entry.demonstrations]
}
