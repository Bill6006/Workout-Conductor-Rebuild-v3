import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MOVEMENT_PATTERN_IDS, type MovementPatternId } from '../movementPatterns/movementPatterns'
import {
  PLACEHOLDER_GENERATED_ON,
  PLACEHOLDER_POSTER_BYTES,
  PLACEHOLDER_POSTER_DIR,
  PLACEHOLDER_POSTER_HEIGHT,
  PLACEHOLDER_POSTER_PATHS,
  PLACEHOLDER_POSTER_WIDTH,
  PLACEHOLDER_PROVENANCE,
  PRODUCTION_MEDIA,
  buildMediaManifest,
  describeMediaCoverage,
  hasRealDemonstration,
  mediaManifestEntries,
  mediaRecordFor,
  placeholderPoster,
  placeholderPosterPath,
  placeholderRecordFor,
  summariseMediaCoverage,
  type MediaExerciseRef,
  type MediaManifestRecord,
} from './mediaManifest'
import { assetsOf, mediaManifestEntrySchema, mediaManifestSchema, mediaProvenanceSchema } from './mediaSchema'

/**
 * The repository root. Vitest runs from it, and under vite-node `import.meta.url`
 * is not a file: URL, so it cannot be resolved from the module's own location.
 */
const ROOT = process.cwd()
const PUBLIC_DIR = join(ROOT, 'public')
const POSTER_DIR = join(PUBLIC_DIR, 'media', 'posters')
const REGISTER = join(ROOT, 'docs', 'media-license-register.md')

/** Every asset path in the manifest is relative to `public/`. */
function onDisk(assetPath: string): string {
  return join(PUBLIC_DIR, assetPath)
}

function ref(overrides: Partial<MediaExerciseRef> = {}): MediaExerciseRef {
  return { id: 'barbell-back-squat', movementPattern: 'squat', productionEnabled: true, ...overrides }
}

/** Every committed file under public/media, as repository-relative POSIX paths. */
function walkPublicMedia(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    const full = join(dir, item.name)
    if (item.isDirectory()) return walkPublicMedia(full)
    return [relative(ROOT, full).split('\\').join('/')]
  })
}

const ALL_PLACEHOLDER_RECORDS: MediaManifestRecord[] = MOVEMENT_PATTERN_IDS.map((patternId) =>
  placeholderRecordFor(ref({ id: `sample-${patternId}`, movementPattern: patternId })),
)

describe('placeholder posters', () => {
  it('draws exactly one poster per movement pattern, and no pattern is left out', () => {
    expect(Object.keys(PLACEHOLDER_POSTER_BYTES).sort()).toEqual([...MOVEMENT_PATTERN_IDS].sort())
    expect(PLACEHOLDER_POSTER_PATHS).toHaveLength(MOVEMENT_PATTERN_IDS.length)
    expect(new Set(PLACEHOLDER_POSTER_PATHS).size).toBe(PLACEHOLDER_POSTER_PATHS.length)
  })

  it('names each poster after its pattern, under the shared poster directory', () => {
    for (const patternId of MOVEMENT_PATTERN_IDS) {
      expect(placeholderPosterPath(patternId)).toBe(`${PLACEHOLDER_POSTER_DIR}/${patternId}.png`)
    }
  })

  it.each([...MOVEMENT_PATTERN_IDS])('ships a real, non-empty PNG for %s', (patternId) => {
    const asset = placeholderPoster(patternId)
    const path = onDisk(asset.path)

    expect(existsSync(path), `${asset.path} is missing — run node scripts/make-exercise-posters.mjs`).toBe(
      true,
    )

    const { size } = statSync(path)
    expect(size).toBeGreaterThan(0)
    // The manifest states a byte size to callers; if it is not the size of the
    // file we actually ship, the manifest is lying. Regenerate and re-transcribe.
    expect(size, `PLACEHOLDER_POSTER_BYTES['${patternId}'] should be ${size}`).toBe(asset.byteSize)

    // A .png extension is not evidence of a PNG. The signature is.
    const signature = readFileSync(path).subarray(0, 8)
    expect([...signature]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  })

  it('leaves no orphan file in the poster directory', () => {
    const expected = new Set(MOVEMENT_PATTERN_IDS.map((id) => `${id}.png`))
    const orphans = readdirSync(POSTER_DIR).filter((file) => !expected.has(file))
    expect(orphans, 'an asset nobody references is an asset nobody licensed').toEqual([])
  })

  it('keeps the whole placeholder set inside the shipped-bundle budget', () => {
    const total = Object.values(PLACEHOLDER_POSTER_BYTES).reduce((sum, size) => sum + size, 0)
    // These are precached by the service worker, so they are paid for on install
    // by every user. 160 KB for the entire set is the ceiling; the current set is
    // well under it, and a redesign that blew past it should have to argue for it.
    expect(total).toBeLessThan(160 * 1024)
  })

  it('states the same dimensions the generator renders at', () => {
    expect(PLACEHOLDER_POSTER_WIDTH).toBe(480)
    expect(PLACEHOLDER_POSTER_HEIGHT).toBe(270)
    for (const patternId of MOVEMENT_PATTERN_IDS) {
      const asset = placeholderPoster(patternId)
      expect(asset.width).toBe(PLACEHOLDER_POSTER_WIDTH)
      expect(asset.height).toBe(PLACEHOLDER_POSTER_HEIGHT)
      expect(asset.mimeType).toBe('image/png')
      expect(asset.durationMs).toBeNull()
    }
  })
})

describe('schema conformance', () => {
  it('validates every placeholder entry against the media contract', () => {
    for (const record of ALL_PLACEHOLDER_RECORDS) {
      const result = mediaManifestEntrySchema.safeParse(record.entry)
      expect(result.success, JSON.stringify(result.error?.issues)).toBe(true)
    }
  })

  it('validates every production entry against the media contract', () => {
    for (const record of PRODUCTION_MEDIA) {
      const result = mediaManifestEntrySchema.safeParse(record.entry)
      expect(result.success, `${record.entry.exerciseId}: ${JSON.stringify(result.error?.issues)}`).toBe(true)
    }
  })

  it('validates a built manifest as a whole', () => {
    const manifest = buildMediaManifest([
      ref({ id: 'barbell-back-squat', movementPattern: 'squat' }),
      ref({ id: 'seated-cable-row', movementPattern: 'horizontal-pull' }),
      ref({ id: 'ab-wheel-rollout', movementPattern: 'anti-extension', productionEnabled: false }),
    ])
    expect(mediaManifestSchema.safeParse(mediaManifestEntries(manifest)).success).toBe(true)
  })

  it('gives one entry per exercise, in the order asked for', () => {
    const refs = [
      ref({ id: 'a-squat', movementPattern: 'squat' }),
      ref({ id: 'b-hinge', movementPattern: 'hinge' }),
    ]
    expect(buildMediaManifest(refs).map((record) => record.entry.exerciseId)).toEqual(['a-squat', 'b-hinge'])
  })
})

describe('provenance', () => {
  it('carries a complete, valid provenance block on every asset it ships', () => {
    const records = [...ALL_PLACEHOLDER_RECORDS, ...PRODUCTION_MEDIA]
    expect(records.length).toBeGreaterThan(0)

    for (const record of records) {
      for (const asset of assetsOf(record.entry)) {
        const result = mediaProvenanceSchema.safeParse(asset.provenance)
        expect(result.success, `${asset.path}: ${JSON.stringify(result.error?.issues)}`).toBe(true)

        expect(asset.provenance.source.trim(), `${asset.path} has no stated source`).not.toBe('')
        expect(asset.provenance.author.trim(), `${asset.path} has no stated author`).not.toBe('')
        expect(asset.provenance.verifiedBy.trim(), `${asset.path} was verified by nobody`).not.toBe('')
        expect(asset.provenance.redistributionPermitted, `${asset.path} may not ship`).toBe(true)

        // "none", "unknown", "public domain probably" are the words that show up
        // when nobody actually checked. A licence is a named licence.
        expect(
          /^(none|unknown|n\/a|tbd|unclear)$/i.test(asset.provenance.licence.trim()),
          `${asset.path} does not name a licence`,
        ).toBe(false)
      }
    }
  })

  it('describes the placeholder honestly, as generated original work', () => {
    expect(PLACEHOLDER_PROVENANCE.source).toContain('scripts/make-exercise-posters.mjs')
    expect(PLACEHOLDER_PROVENANCE.author).toBe('Workout Conductor')
    expect(PLACEHOLDER_PROVENANCE.licenceUrl).toBeNull()
    expect(PLACEHOLDER_PROVENANCE.verifiedOn).toBe(PLACEHOLDER_GENERATED_ON)
    expect(PLACEHOLDER_PROVENANCE.notes).toMatch(/NOT a demonstration/)
  })

  it('never points an asset at a remote origin', () => {
    for (const record of [...ALL_PLACEHOLDER_RECORDS, ...PRODUCTION_MEDIA]) {
      for (const asset of assetsOf(record.entry)) {
        expect(asset.path).not.toMatch(/^https?:/)
        expect(asset.path.startsWith('media/')).toBe(true)
      }
    }
  })
})

describe('the licence register', () => {
  const registerText = readFileSync(REGISTER, 'utf8')

  it('has a row for every asset the manifest ships', () => {
    const shipped = new Set<string>()
    for (const record of [...ALL_PLACEHOLDER_RECORDS, ...PRODUCTION_MEDIA]) {
      for (const asset of assetsOf(record.entry)) shipped.add(`public/${asset.path}`)
    }

    const missing = [...shipped].filter((path) => !registerText.includes(path))
    expect(missing, 'no row, no commit — add these to docs/media-license-register.md').toEqual([])
  })

  it('has a row for every file committed under public/media', () => {
    const committed = walkPublicMedia(join(PUBLIC_DIR, 'media'))
    expect(committed.length).toBeGreaterThan(0)

    const unregistered = committed.filter((path) => !registerText.includes(path))
    expect(unregistered, 'a committed asset with no register row is a defect').toEqual([])
  })

  it('references every committed file from the manifest, so nothing ships unused', () => {
    const referenced = new Set(PLACEHOLDER_POSTER_PATHS.map((path) => `public/${path}`))
    for (const record of PRODUCTION_MEDIA) {
      for (const asset of assetsOf(record.entry)) referenced.add(`public/${asset.path}`)
    }

    const committed = walkPublicMedia(join(PUBLIC_DIR, 'media'))
    expect(committed.filter((path) => !referenced.has(path))).toEqual([])
  })
})

describe('the lookup', () => {
  it('falls back to the movement pattern poster, and says that is what it did', () => {
    const record = mediaRecordFor(ref({ id: 'anything-at-all', movementPattern: 'hinge' }))
    expect(record.isPlaceholder).toBe(true)
    expect(record.placeholderPattern).toBe('hinge')
    expect(record.entry.exerciseId).toBe('anything-at-all')
    expect(record.entry.poster.path).toBe('media/posters/hinge.png')
    expect(record.entry.demonstrations).toEqual([])
    expect(hasRealDemonstration(record)).toBe(false)
  })

  it('never returns null, so no screen has to render an empty frame', () => {
    for (const patternId of MOVEMENT_PATTERN_IDS) {
      const record = mediaRecordFor(ref({ id: `unknown-${patternId}`, movementPattern: patternId }))
      expect(record.entry.poster.byteSize).toBeGreaterThan(0)
    }
  })

  it('prefers a real entry when the exercise has one', () => {
    const real = PRODUCTION_MEDIA[0]
    if (!real) {
      // Phase 2 ships no real media. The branch is still covered by the flag
      // semantics tested above; this is the arm that will light up in Phase 8.
      expect(PRODUCTION_MEDIA).toEqual([])
      return
    }
    const found = mediaRecordFor({
      id: real.entry.exerciseId,
      movementPattern: 'squat',
      productionEnabled: true,
    })
    expect(found).toBe(real)
    expect(found.isPlaceholder).toBe(false)
    expect(found.placeholderPattern).toBeNull()
  })

  it('marks a placeholder distinguishably from a finished asset', () => {
    const placeholder = placeholderRecordFor(ref())
    expect(placeholder.isPlaceholder).toBe(true)
    expect(placeholder.placeholderPattern).not.toBeNull()
  })
})

describe('coverage', () => {
  it('counts production-enabled exercises only', () => {
    const coverage = summariseMediaCoverage([
      ref({ id: 'live-one', movementPattern: 'squat', productionEnabled: true }),
      ref({ id: 'live-two', movementPattern: 'hinge', productionEnabled: true }),
      ref({ id: 'shelved', movementPattern: 'carry', productionEnabled: false }),
    ])

    expect(coverage.total).toBe(3)
    expect(coverage.productionEnabled).toBe(2)
    expect(coverage.withPlaceholder).toBe(2)
    expect(coverage.withRealDemonstration).toBe(0)
    expect(coverage.withRealPosterOnly).toBe(0)
    expect(coverage.placeholderExerciseIds).toEqual(['live-one', 'live-two'])
  })

  it('summarises itself in one readable line', () => {
    const coverage = summariseMediaCoverage([ref({ id: 'only-one' })])
    expect(describeMediaCoverage(coverage)).toBe(
      '0/1 production-enabled exercises have a real demonstration; 0 have a real poster only; ' +
        '1 still show a generated placeholder.',
    )
  })
})

/**
 * The Phase 8 acceptance gate, running today as a REPORT.
 *
 * The plan's final acceptance requires that every production-enabled exercise has
 * a working visual demonstration. Phase 2 does not ship one, and pretending
 * otherwise by not measuring it is how that gets discovered in Phase 8.
 *
 * TO TURN THIS INTO THE GATE, change one line: replace the `console.warn` block
 * with
 *
 *     expect(coverage.withPlaceholder, describeMediaCoverage(coverage)).toBe(0)
 *
 * Nothing else about the test needs to move. It already loads the real catalog,
 * already counts the real records, and already names the exercises that fail.
 *
 * The catalog is loaded through `import.meta.glob` rather than a plain import so
 * that this file passes both before and after the exercise data lands: a glob
 * with no matches is an empty object, not a resolution error. Two globs, because
 * the media work does not own the catalog's file layout and must not force one —
 * the aggregate module is preferred when it exists, and the per-group data files
 * are read directly when it does not. Neither glob is eager, so nothing here puts
 * catalog data on any import path but this test's.
 */
const exerciseDataModules = import.meta.glob('../exercises/exerciseData.ts')
const exerciseDataGroupModules = import.meta.glob('../exercises/data/*.ts')

/** The three fields the manifest needs. Anything else on an exercise is ignored. */
interface CatalogShape {
  readonly id?: unknown
  readonly movementPattern?: unknown
  readonly productionEnabled?: unknown
}

const PATTERN_IDS = new Set<string>(MOVEMENT_PATTERN_IDS)

function isExerciseShaped(
  item: CatalogShape,
): item is { id: string; movementPattern: MovementPatternId; productionEnabled: boolean } {
  return (
    typeof item?.id === 'string' &&
    typeof item.movementPattern === 'string' &&
    PATTERN_IDS.has(item.movementPattern) &&
    typeof item.productionEnabled === 'boolean'
  )
}

/** Every exercise-shaped object in any array-valued export of a module. */
function refsIn(module: Record<string, unknown>): MediaExerciseRef[] {
  const preferred = Array.isArray(module.EXERCISES) ? [module.EXERCISES] : Object.values(module)
  return preferred
    .filter((value): value is unknown[] => Array.isArray(value))
    .flatMap((list) => (list as CatalogShape[]).filter(isExerciseShaped))
    .map((item) => ({
      id: item.id,
      movementPattern: item.movementPattern,
      productionEnabled: item.productionEnabled,
    }))
}

async function loadCatalogRefs(): Promise<MediaExerciseRef[] | null> {
  const groupLoaders = Object.entries(exerciseDataGroupModules)
    .filter(([path]) => !/\.test\.tsx?$/.test(path))
    .map(([, load]) => load)
  const loaders = [...Object.values(exerciseDataModules), ...groupLoaders]
  if (loaders.length === 0) return null

  const byId = new Map<string, MediaExerciseRef>()
  for (const load of loaders) {
    let module: Record<string, unknown>
    try {
      module = (await load()) as Record<string, unknown>
    } catch (error) {
      // A half-written catalog file is a report that cannot run, not a media
      // defect. Say so loudly rather than reporting a comfortable zero.
      console.warn('media coverage: an exercise catalog module could not be loaded —', error)
      continue
    }
    // The aggregate module wins where both exist: a group file re-listed inside
    // it must not be counted twice.
    for (const item of refsIn(module)) if (!byId.has(item.id)) byId.set(item.id, item)
  }

  return byId.size === 0 ? null : [...byId.values()]
}

describe('media coverage of the real catalog', () => {
  it('reports how many exercises still show a placeholder', async () => {
    const refs = await loadCatalogRefs()

    if (!refs) {
      console.warn(
        'media coverage: no exercise catalog module found yet, so nothing to measure. ' +
          'This report becomes meaningful the moment src/catalog/exercises/exerciseData.ts exists.',
      )
      expect(PRODUCTION_MEDIA).toEqual([])
      return
    }

    const coverage = summariseMediaCoverage(refs)

    // PHASE 8: replace this block with the single assertion documented above.
    console.warn(`media coverage: ${describeMediaCoverage(coverage)}`)
    if (coverage.withPlaceholder > 0) {
      console.warn(
        `media coverage: ${coverage.withPlaceholder} exercise(s) awaiting a real demonstration, ` +
          `first few: ${coverage.placeholderExerciseIds.slice(0, 8).join(', ')}`,
      )
    }

    // What IS a gate today: every exercise resolves to something renderable, and
    // whatever it resolved to is honestly labelled.
    for (const record of buildMediaManifest(refs)) {
      expect(record.entry.poster.byteSize).toBeGreaterThan(0)
      expect(typeof record.isPlaceholder).toBe('boolean')
      expect(record.isPlaceholder ? record.placeholderPattern !== null : true).toBe(true)
    }
  })
})

describe('bundle discipline', () => {
  const SOURCE_ROOT = join(ROOT, 'src')

  function walkSource(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
      const full = join(dir, item.name)
      if (item.isDirectory()) return walkSource(full)
      return /\.tsx?$/.test(item.name) ? [full] : []
    })
  }

  it('is reachable only through a dynamic import', () => {
    const offenders: string[] = []

    for (const file of walkSource(SOURCE_ROOT)) {
      if (/\.test\.tsx?$/.test(file)) continue

      const text = readFileSync(file, 'utf8')
      // A static `import ... from '<something>/mediaManifest'` or a re-export of
      // it. `await import('./mediaManifest')` is what this module is FOR, so it
      // is deliberately not matched.
      if (/\bfrom\s+['"][^'"]*mediaManifest['"]/.test(text)) {
        offenders.push(relative(ROOT, file).split('\\').join('/'))
      }
    }

    expect(
      offenders,
      'the manifest is catalog-sized data; import it with await import() so it lands in its own chunk',
    ).toEqual([])
  })

  it('is not re-exported from the media barrel', () => {
    const barrel = readFileSync(join(ROOT, 'src', 'catalog', 'media', 'index.ts'), 'utf8')
    // The specifier, not the substring: `mediaManifestEntrySchema` is a schema
    // export and belongs in the barrel.
    expect(barrel).not.toMatch(/from\s+['"][^'"]*\/mediaManifest['"]/)
  })
})
