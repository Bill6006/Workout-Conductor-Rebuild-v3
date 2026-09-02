import { readFileSync, readdirSync, statSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * THE CATALOG MAY NOT LAND ON THE BOOT CHUNK.
 *
 * The exercise catalog is the largest data in the product — 231 KB raw, 39 KB
 * gzipped, in a chunk of its own — and first paint is already at ~117 KB gzipped
 * against a 2 s startup target on a 4x-throttled profile. Nothing a person sees
 * before they open the exercise picker needs a single byte of it.
 *
 * WHY THIS IS A TEST AND NOT A CODE REVIEW. The regression is one character wide
 * and looks like an improvement every time somebody makes it:
 *
 *     import { EXERCISES } from '../../catalog/exercises/catalog'   // tidy
 *     import type * as Catalog from '.../catalog'                   // -> drop `type`
 *     export * from './catalog'                                     // in the barrel
 *
 * None of those break a test, change a screen, or produce a warning. The app
 * still works — it just takes a third of a second longer to open, forever, on
 * every launch, for everybody. The only signal is a bundle report nobody reads on
 * the pull request that caused it.
 *
 * SO THE ASSERTION IS ON THE SOURCE GRAPH, NOT ON A BUILD. Walking the static
 * import graph from `src/main.tsx` costs milliseconds, needs no `dist/`, and
 * fails on the commit that introduces the import rather than on whoever next runs
 * a production build. `import type` is excluded because `verbatimModuleSyntax`
 * erases it outright; a dynamic `import()` is recorded but never followed,
 * because that is precisely the seam being protected.
 *
 * The built output is checked too, further down, when a `dist/` happens to be
 * present — as a second opinion on the graph walk, never as the primary gate.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const SRC = join(ROOT, 'src')

/** The one module that assembles and exports the catalog data. */
const CATALOG_MODULE = join(SRC, 'catalog', 'exercises', 'catalog.ts')
/** The three authored region files it assembles. */
const CATALOG_DATA_DIR = join(SRC, 'catalog', 'exercises', 'data')

/** What the browser actually starts from. */
const ENTRY = join(SRC, 'main.tsx')

function repoPath(absolute: string): string {
  return relative(ROOT, absolute).replace(/\\/g, '/')
}

/* ------------------------------------------------------------------ *
 * A very small module-graph walker
 * ------------------------------------------------------------------ */

/**
 * Comments are stripped before the import scan. The codebase is heavily
 * commented, and several of those comments quote the exact import statements this
 * test is looking for — a scan over raw text would report the warning against
 * doing the thing as the thing itself.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

interface Imports {
  /** Specifiers linked into the importing chunk. */
  readonly statik: readonly string[]
  /** Specifiers that become a chunk of their own. Recorded, never followed. */
  readonly dynamic: readonly string[]
}

function readImports(file: string): Imports {
  const source = stripComments(readFileSync(file, 'utf8'))
  const statik: string[] = []
  const dynamic: string[] = []

  // `import ... from '…'` and `export ... from '…'`. The clause is captured so a
  // type-only statement can be discarded: `import type X from` and
  // `export type { X } from` are erased by verbatimModuleSyntax and cost nothing.
  // An inline `import { type A, b }` is NOT type-only and is kept.
  const fromPattern = /\b(?:import|export)\b([\s\S]{0,800}?)\bfrom\s*['"]([^'"]+)['"]/g
  for (const match of source.matchAll(fromPattern)) {
    const clause = match[1]
    if (/^\s*type\b/.test(clause)) continue
    statik.push(match[2])
  }

  // Side-effect imports: `import './styles.css'`.
  for (const match of source.matchAll(/(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g)) statik.push(match[1])

  for (const match of source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) dynamic.push(match[1])

  return { statik, dynamic }
}

const EXTENSIONS = ['', '.ts', '.tsx', '/index.ts', '/index.tsx']

/**
 * A specifier to a file in `src/`, or null when it resolves outside it (a node
 * module, a stylesheet, an asset). Mirrors the two resolutions the build does:
 * relative paths, and the `@/` alias vite.config.ts declares.
 */
function resolveSpecifier(fromFile: string, specifier: string): string | null {
  let base: string
  if (specifier.startsWith('.')) base = resolve(dirname(fromFile), specifier)
  else if (specifier.startsWith('@/')) base = join(SRC, specifier.slice(2))
  else return null

  for (const extension of EXTENSIONS) {
    const candidate = `${base}${extension}`
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

interface Graph {
  /** Every file statically reachable from the entry, entry included. */
  readonly reachable: ReadonlySet<string>
  /** importer -> the file it statically imports, for a readable failure path. */
  readonly importedBy: ReadonlyMap<string, string>
}

function walkStaticGraph(entry: string): Graph {
  const reachable = new Set<string>([entry])
  const importedBy = new Map<string, string>()
  const queue = [entry]

  while (queue.length > 0) {
    const file = queue.pop() as string
    for (const specifier of readImports(file).statik) {
      const target = resolveSpecifier(file, specifier)
      if (!target || reachable.has(target)) continue
      reachable.add(target)
      importedBy.set(target, file)
      queue.push(target)
    }
  }

  return { reachable, importedBy }
}

/** The chain from the entry down to `file`, for a failure somebody can act on. */
function chainTo(graph: Graph, file: string): string {
  const chain: string[] = []
  let current: string | undefined = file
  while (current) {
    chain.unshift(repoPath(current))
    current = graph.importedBy.get(current)
  }
  return chain.join('\n    -> ')
}

function everyFileUnder(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...everyFileUnder(full))
    else if (/\.tsx?$/.test(entry.name)) found.push(full)
  }
  return found
}

const GRAPH = walkStaticGraph(ENTRY)
const CATALOG_DATA_FILES = [CATALOG_MODULE, ...everyFileUnder(CATALOG_DATA_DIR).filter(isNotATest)]

function isNotATest(file: string): boolean {
  return !/\.test\.tsx?$/.test(file)
}

/* ------------------------------------------------------------------ *
 * The guard
 * ------------------------------------------------------------------ */

describe('the exercise catalog stays off the boot chunk', () => {
  it('walks a graph that actually reaches the app', () => {
    // A guard whose graph walk silently found nothing would pass forever. These
    // two are unambiguously on the boot path, so their presence proves the walker
    // resolves both relative specifiers and real modules.
    expect(GRAPH.reachable.has(join(SRC, 'app', 'App.tsx')), 'the walker never reached App.tsx').toBe(true)
    expect(
      GRAPH.reachable.has(join(SRC, 'core', 'validation', 'schemas.ts')),
      'the walker never reached the profile schema, which every launch parses',
    ).toBe(true)
    expect(GRAPH.reachable.size).toBeGreaterThan(20)
  })

  it('never reaches the catalog data by a static import from src/main.tsx', () => {
    const leaked = CATALOG_DATA_FILES.filter((file) => GRAPH.reachable.has(file)).map(
      (file) => `${repoPath(file)} is on the boot chunk via:\n    ${chainTo(GRAPH, file)}`,
    )

    expect(
      leaked,
      'the exercise catalog reached the entry chunk — see the import chain above; ' +
        'the fix is a dynamic import() at the last link, never a bigger startup budget',
    ).toEqual([])
  })

  it('keeps the catalog out of every module the boot chunk pulls in', () => {
    // The check above, stated from the other end: not one statically reachable
    // module may name the catalog data at all, however deep it sits. A single
    // `export * from './catalog'` in a barrel would put it on the boot chunk
    // without any file looking like it imported exercise data.
    const offenders: string[] = []

    for (const file of GRAPH.reachable) {
      for (const specifier of readImports(file).statik) {
        const target = resolveSpecifier(file, specifier)
        if (target && CATALOG_DATA_FILES.includes(target)) {
          offenders.push(`${repoPath(file)} statically imports ${repoPath(target)}`)
        }
      }
    }

    expect(offenders.sort()).toEqual([])
  })

  it('exposes no exercise data through the catalog barrel', async () => {
    // The barrel is the tempting place to put it, because the import site then
    // looks identical to every other catalog import. Asserted on the loaded
    // module rather than on its text, so a re-export written any way at all
    // fails here.
    const barrel = await import('../catalog/exercises/index')
    const dataShaped = Object.entries(barrel).filter(
      ([, value]) =>
        Array.isArray(value) && value.length > 5 && value.every((entry) => isExerciseShaped(entry)),
    )

    expect(dataShaped.map(([name]) => name)).toEqual([])
  })

  it('reaches the catalog from exactly the module that owns the dynamic import', () => {
    // One seam, named, so a second import site is a test failure rather than a
    // thing somebody notices in a bundle report. `useExerciseCatalog` is the only
    // module in src/features allowed to name the catalog path; the engines take
    // the catalog as an argument and never import it.
    const importers = everyFileUnder(SRC)
      .filter(isNotATest)
      .filter((file) => {
        const { dynamic } = readImports(file)
        return dynamic.some((specifier) => resolveSpecifier(file, specifier) === CATALOG_MODULE)
      })
      .map(repoPath)
      .sort()

    expect(importers).toEqual(['src/features/exercisePreferences/useExerciseCatalog.ts'])
  })
})

function isExerciseShaped(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'primaryMuscles' in value &&
    'movementPattern' in value
  )
}

/* ------------------------------------------------------------------ *
 * The built output, when there is one
 * ------------------------------------------------------------------ */

/**
 * A second opinion, not the gate. `npm run verify` runs the unit tests BEFORE it
 * builds, so `dist/` here is whatever the last build left — possibly stale,
 * possibly absent. That is fine for what this adds: it confirms the graph walk
 * above agrees with what Rollup actually emitted, and it would catch a chunking
 * configuration that inlined a dynamic import back into the entry, which no
 * source-level check can see.
 */
const DIST_ASSETS = join(ROOT, 'dist', 'assets')
const HAS_DIST = existsSync(DIST_ASSETS)

describe.runIf(HAS_DIST)('the last built entry chunk carries no catalog data', () => {
  const files = HAS_DIST ? readdirSync(DIST_ASSETS) : []
  const entryChunks = files.filter((name) => /^index-.*\.js$/.test(name))

  /**
   * Strings that exist nowhere but in the exercise data: an exercise name, an id,
   * a muscle id used only by catalog entries, and a field name only the exercise
   * schema's output carries.
   */
  const CATALOG_FINGERPRINTS = [
    'Barbell bench press',
    'incline-dumbbell-press',
    'progressionFamily',
    'instructionSteps',
  ]

  it('emitted exactly one entry chunk to look at', () => {
    expect(entryChunks).toHaveLength(1)
  })

  it('has no exercise name, id, or catalog-only field in it', () => {
    const chunk = readFileSync(join(DIST_ASSETS, entryChunks[0]), 'utf8')
    const found = CATALOG_FINGERPRINTS.filter((needle) => chunk.includes(needle))

    expect(
      found,
      `${entryChunks[0]} contains catalog data. Rebuild first if dist/ is stale; if it is not, ` +
        'a static import put the catalog back on first paint.',
    ).toEqual([])
  })

  it('put the catalog in a lazily-loaded chunk of its own', () => {
    const catalogChunks = files.filter((name) => {
      if (!name.endsWith('.js')) return false
      const text = readFileSync(join(DIST_ASSETS, name), 'utf8')
      return text.includes('Barbell bench press')
    })

    expect(catalogChunks, 'the catalog data is in no chunk at all, or in more than one').toHaveLength(1)
    expect(catalogChunks[0]).not.toMatch(/^index-/)
  })
})
