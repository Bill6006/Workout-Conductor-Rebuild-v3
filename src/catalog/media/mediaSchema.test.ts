import { describe, expect, it } from 'vitest'
import {
  MEDIA_KINDS,
  assetsOf,
  mediaAssetSchema,
  mediaEntryFor,
  mediaKindSchema,
  mediaManifestEntrySchema,
  mediaManifestSchema,
  mediaProvenanceSchema,
  type MediaAsset,
} from './mediaSchema'

const PROVENANCE = {
  source: 'original',
  author: 'Workout Conductor',
  licence: 'CC0 1.0',
  licenceUrl: null,
  redistributionPermitted: true,
  verifiedOn: '2026-09-01',
  verifiedBy: 'the media reviewer',
  notes: '',
}

function asset(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    path: 'media/incline-dumbbell-press/poster.webp',
    kind: 'poster',
    mimeType: 'image/webp',
    width: 960,
    height: 540,
    byteSize: 42_000,
    durationMs: null,
    provenance: { ...PROVENANCE },
    ...overrides,
  }
}

function demonstration(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return asset({
    path: 'media/incline-dumbbell-press/front.webm',
    kind: 'demonstration',
    mimeType: 'video/webm',
    durationMs: 4000,
    ...overrides,
  })
}

function entry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    exerciseId: 'incline-dumbbell-press',
    poster: asset(),
    demonstrations: [demonstration()],
    ...overrides,
  }
}

describe('media kinds', () => {
  it('lists each kind once and exposes the same values through its Zod enum', () => {
    expect(new Set(MEDIA_KINDS).size).toBe(MEDIA_KINDS.length)
    expect(mediaKindSchema.options).toEqual([...MEDIA_KINDS])
    expect(mediaKindSchema.safeParse('poster').success).toBe(true)
    expect(mediaKindSchema.safeParse('gif').success).toBe(false)
  })
})

describe('provenance', () => {
  it('takes a complete row', () => {
    expect(mediaProvenanceSchema.safeParse(PROVENANCE).success).toBe(true)
  })

  it('requires every field, so an asset cannot be added and accounted for later', () => {
    for (const field of ['source', 'author', 'licence', 'verifiedOn', 'verifiedBy'] as const) {
      const missing: Record<string, unknown> = { ...PROVENANCE }
      delete missing[field]
      expect(mediaProvenanceSchema.safeParse(missing).success, `${field} should be required`).toBe(false)
    }
    expect(
      mediaProvenanceSchema.safeParse({ ...PROVENANCE, redistributionPermitted: undefined }).success,
    ).toBe(false)
  })

  it('refuses an empty source, author, or licence — "none" is not a licence', () => {
    expect(mediaProvenanceSchema.safeParse({ ...PROVENANCE, source: '' }).success).toBe(false)
    expect(mediaProvenanceSchema.safeParse({ ...PROVENANCE, author: '' }).success).toBe(false)
    expect(mediaProvenanceSchema.safeParse({ ...PROVENANCE, licence: '' }).success).toBe(false)
    expect(mediaProvenanceSchema.safeParse({ ...PROVENANCE, verifiedBy: '' }).success).toBe(false)
  })

  it('takes a licence with a URL, or none, but never an omitted answer', () => {
    // The two URLs in this file use the reserved `.invalid` domain (RFC 2606) and
    // are fixture strings the app never fetches — the product makes no network
    // requests at all. They are marked so the privacy scan does not read a test
    // fixture as a third-party origin the app talks to.
    const url = 'https://licences.example.invalid/cc0' // privacy-scan-allow:external-origin
    expect(mediaProvenanceSchema.safeParse({ ...PROVENANCE, licenceUrl: url }).success).toBe(true)
    expect(mediaProvenanceSchema.safeParse({ ...PROVENANCE, licenceUrl: null }).success).toBe(true)
    expect(mediaProvenanceSchema.safeParse({ ...PROVENANCE, licenceUrl: undefined }).success).toBe(false)
  })

  it('requires the date the licence was checked, in a date shape', () => {
    expect(mediaProvenanceSchema.safeParse({ ...PROVENANCE, verifiedOn: '2026-9-1' }).success).toBe(false)
    expect(mediaProvenanceSchema.safeParse({ ...PROVENANCE, verifiedOn: 'last week' }).success).toBe(false)
    expect(mediaProvenanceSchema.safeParse({ ...PROVENANCE, verifiedOn: '2026-09-01' }).success).toBe(true)
  })

  it('is strict, so a misspelled provenance field cannot pass for a filled-in one', () => {
    expect(mediaProvenanceSchema.safeParse({ ...PROVENANCE, licence_url: 'x' }).success).toBe(false)
  })
})

describe('a media asset', () => {
  it('takes a repository-relative path under the media root, and never a URL', () => {
    // A remote origin would be a network request the privacy scan exists to stop.
    expect(mediaAssetSchema.safeParse(asset()).success).toBe(true)
    const remote = 'https://cdn.example.invalid/poster.webp' // privacy-scan-allow:external-origin
    expect(mediaAssetSchema.safeParse(asset({ path: remote })).success).toBe(false)
    expect(mediaAssetSchema.safeParse(asset({ path: '/media/poster.webp' })).success).toBe(false)
    expect(mediaAssetSchema.safeParse(asset({ path: 'assets/poster.webp' })).success).toBe(false)
    expect(mediaAssetSchema.safeParse(asset({ path: 'media/Poster.webp' })).success).toBe(false)
    expect(mediaAssetSchema.safeParse(asset({ path: 'media/poster' })).success).toBe(false)
  })

  it('takes only a type we serve ourselves', () => {
    for (const mimeType of ['image/webp', 'image/png', 'video/webm', 'video/mp4']) {
      expect(mediaAssetSchema.safeParse(asset({ mimeType })).success).toBe(true)
    }
    expect(mediaAssetSchema.safeParse(asset({ mimeType: 'image/gif' })).success).toBe(false)
  })

  it('refuses an impossible size', () => {
    expect(mediaAssetSchema.safeParse(asset({ width: 0 })).success).toBe(false)
    expect(mediaAssetSchema.safeParse(asset({ height: 8001 })).success).toBe(false)
    expect(mediaAssetSchema.safeParse(asset({ byteSize: 0 })).success).toBe(false)
    expect(mediaAssetSchema.safeParse(asset({ durationMs: 120_001 })).success).toBe(false)
  })

  it('requires provenance on the asset, not on the entry', () => {
    const missing: Record<string, unknown> = asset()
    delete missing.provenance
    expect(mediaAssetSchema.safeParse(missing).success).toBe(false)
  })
})

describe('a manifest entry', () => {
  it('takes a poster and its demonstrations', () => {
    const result = mediaManifestEntrySchema.safeParse(entry())
    expect(result.success, result.success ? '' : JSON.stringify(result.error.issues)).toBe(true)
  })

  it('requires a poster — an exercise with no still has nothing to show', () => {
    const missing: Record<string, unknown> = entry()
    delete missing.poster
    expect(mediaManifestEntrySchema.safeParse(missing).success).toBe(false)
  })

  it('takes an entry with no demonstrations at all, and caps how many there can be', () => {
    expect(mediaManifestEntrySchema.safeParse(entry({ demonstrations: [] })).success).toBe(true)
    expect(
      mediaManifestEntrySchema.safeParse(
        entry({ demonstrations: Array.from({ length: 5 }, () => demonstration()) }),
      ).success,
    ).toBe(false)
  })

  it('refuses an asset filed under the wrong kind', () => {
    expect(
      mediaManifestEntrySchema.safeParse(entry({ poster: asset({ kind: 'demonstration' }) })).success,
    ).toBe(false)
    expect(
      mediaManifestEntrySchema.safeParse(entry({ demonstrations: [demonstration({ kind: 'poster' })] }))
        .success,
    ).toBe(false)
  })

  it('requires a demonstration to state its length', () => {
    const result = mediaManifestEntrySchema.safeParse(
      entry({ demonstrations: [demonstration({ durationMs: null })] }),
    )
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues[0].path).toEqual(['demonstrations', 0])
  })

  it('refuses to ship anything the licence does not permit us to redistribute', () => {
    const blocked = { ...PROVENANCE, redistributionPermitted: false }

    const posterBlocked = mediaManifestEntrySchema.safeParse(
      entry({ poster: asset({ provenance: blocked }) }),
    )
    expect(posterBlocked.success).toBe(false)
    if (!posterBlocked.success) {
      expect(posterBlocked.error.issues.some((issue) => issue.path[0] === 'poster')).toBe(true)
    }

    const demoBlocked = mediaManifestEntrySchema.safeParse(
      entry({ demonstrations: [demonstration({ provenance: blocked })] }),
    )
    expect(demoBlocked.success).toBe(false)
    if (!demoBlocked.success) {
      expect(demoBlocked.error.issues.some((issue) => issue.path[0] === 'demonstrations')).toBe(true)
    }
  })

  it('keys on an exercise id in the same kebab-case shape the catalog uses', () => {
    expect(mediaManifestEntrySchema.safeParse(entry({ exerciseId: 'Incline Press' })).success).toBe(false)
    expect(mediaManifestEntrySchema.safeParse(entry({ exerciseId: '' })).success).toBe(false)
  })
})

describe('reading a manifest', () => {
  const manifest = mediaManifestSchema.parse([
    entry(),
    entry({ exerciseId: 'barbell-back-squat', demonstrations: [] }),
  ])

  it('takes an empty manifest, which is what an unfinished media pass looks like', () => {
    expect(mediaManifestSchema.safeParse([]).success).toBe(true)
  })

  it('finds the entry for an exercise, and says null rather than guessing', () => {
    expect(mediaEntryFor(manifest, 'barbell-back-squat')?.exerciseId).toBe('barbell-back-squat')
    expect(mediaEntryFor(manifest, 'nothing-here')).toBeNull()
    expect(mediaEntryFor([], 'incline-dumbbell-press')).toBeNull()
  })

  it('lists every asset an entry references, poster first', () => {
    const assets: MediaAsset[] = assetsOf(manifest[0])
    expect(assets).toHaveLength(2)
    expect(assets[0].kind).toBe('poster')
    expect(assets[1].kind).toBe('demonstration')
    expect(assetsOf(manifest[1])).toHaveLength(1)
  })
})
