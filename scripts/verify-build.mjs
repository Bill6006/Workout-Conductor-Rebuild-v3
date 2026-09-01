#!/usr/bin/env node
/**
 * Verifies that dist/ is a deployable GitHub Pages build.
 *
 * This is the last gate before an artifact is uploaded. Everything it asserts
 * is something that would silently produce a blank page, a broken install
 * prompt, or a 404 on the live site rather than failing the build:
 *   - asset URLs carry the repository sub-path, and none escape it
 *   - the SPA fallback and .nojekyll exist
 *   - the service worker and manifest were emitted, the manifest's identity
 *     fields match what this repository is supposed to publish, and it points
 *     at icons that are actually on disk — including a maskable one
 *   - the build marker made it into the bundle, so the deployed commit is
 *     identifiable on screen
 *   - no source maps leaked out
 *
 * Every check's label states exactly what it asserts and nothing more. A
 * verification script that overstates itself is worse than no script at all.
 *
 * Usage: node scripts/verify-build.mjs   (`npm run verify:build`)
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DIST = join(ROOT, 'dist')
const BASE = '/Workout-Conductor-Rebuild-v3/'

/**
 * The manifest values this build is expected to ship. They are duplicated from
 * vite.config.ts on purpose: a check that reads its expectation out of the same
 * config that produced the output cannot notice a bad rename.
 */
const EXPECTED_MANIFEST = {
  id: BASE,
  name: 'Workout Conductor',
  short_name: 'Conductor',
  start_url: BASE,
  scope: BASE,
  display: 'standalone',
  theme_color: '#0a0b0a',
}

const green = (text) => `\u001b[32m${text}\u001b[0m`
const red = (text) => `\u001b[31m${text}\u001b[0m`

class VerifyError extends Error {}

function fail(message) {
  throw new VerifyError(message)
}

function distPath(...parts) {
  return join(DIST, ...parts)
}

function rel(absolute) {
  return relative(ROOT, absolute).replace(/\\/g, '/')
}

async function requireFile(relativePath, { minBytes = 1 } = {}) {
  const absolute = distPath(relativePath)
  if (!existsSync(absolute)) fail(`${rel(absolute)} is missing`)

  const { size } = await stat(absolute)
  if (size < minBytes) fail(`${rel(absolute)} is empty (${size} bytes, expected at least ${minBytes})`)

  return absolute
}

async function walk(dir, files = []) {
  const entries = await readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      await walk(full, files)
    } else if (entry.isFile()) {
      files.push(full)
    }
  }

  return files
}

async function readBundleJs() {
  const assetsDir = distPath('assets')
  if (!existsSync(assetsDir)) fail('dist/assets/ is missing — the build emitted no JavaScript')

  const scripts = (await walk(assetsDir)).filter((file) => file.endsWith('.js'))
  if (scripts.length === 0) fail('dist/assets/ contains no .js files')

  const contents = await Promise.all(scripts.map((file) => readFile(file, 'utf8')))
  return { scripts, text: contents.join('\n') }
}

/**
 * Manifest icon `src` values may be emitted either base-prefixed or relative to
 * the manifest. Accept both and resolve against dist/.
 */
function resolveManifestAsset(src) {
  let value = src.trim()
  if (/^https?:\/\//i.test(value)) return null
  if (value.startsWith(BASE)) value = value.slice(BASE.length)
  value = value.replace(/^\.?\//, '')
  return distPath(...value.split('/'))
}

const checks = [
  {
    label: 'dist/index.html exists and is not a stub',
    async run() {
      await requireFile('index.html', { minBytes: 200 })
    },
  },
  {
    label: `no index.html URL escapes ${BASE} (external, root-absolute, or ../)`,
    async run() {
      const html = await readFile(distPath('index.html'), 'utf8')
      if (!html.includes(`${BASE}assets/`)) {
        fail(`dist/index.html has no asset URL under ${BASE}assets/ — check vite \`base\``)
      }

      // Every src/href, not just the root-absolute ones. A CDN reference or a
      // `../` escape would both survive a root-absolute-only check and both
      // break the deployed page, so classify the whole set.
      const escaped = [...html.matchAll(/(?:src|href)="([^"]*)"/g)]
        .map((match) => match[1])
        .filter((url) => {
          if (url === '' || url.startsWith('#') || url.startsWith('data:')) return false
          if (/^(?:https?:)?\/\//i.test(url)) return true // absolute or protocol-relative
          if (url.startsWith('/')) return !url.startsWith(BASE) // root-absolute outside the base
          return url.includes('../') // relative path climbing out of the deployment
        })
      if (escaped.length > 0) {
        fail(`dist/index.html has URLs outside the Pages base: ${escaped.join(', ')}`)
      }
    },
  },
  {
    label: 'dist/404.html exists and is not a stub (SPA fallback)',
    async run() {
      await requireFile('404.html', { minBytes: 200 })
    },
  },
  {
    label: 'dist/.nojekyll exists',
    async run() {
      if (!existsSync(distPath('.nojekyll')))
        fail('dist/.nojekyll is missing — Pages would skip _-prefixed files')
    },
  },
  {
    label: 'service worker dist/sw.js exists and is not empty',
    async run() {
      await requireFile('sw.js', { minBytes: 100 })
    },
  },
  {
    label: 'dist/manifest.webmanifest exists and parses',
    async run() {
      const absolute = await requireFile('manifest.webmanifest', { minBytes: 50 })
      try {
        JSON.parse(await readFile(absolute, 'utf8'))
      } catch (error) {
        fail(`dist/manifest.webmanifest is not valid JSON: ${error.message}`)
      }
    },
  },
  {
    label: 'manifest id, name, short_name, start_url, scope, display, and theme_color are correct',
    async run() {
      const manifest = JSON.parse(await readFile(distPath('manifest.webmanifest'), 'utf8'))

      for (const [key, expected] of Object.entries(EXPECTED_MANIFEST)) {
        const actual = String(manifest[key] ?? '')
        // theme_color is the one field a build tool may re-case on us.
        const normalised = key === 'theme_color' ? actual.toLowerCase() : actual
        if (normalised !== expected) {
          fail(`manifest.${key} is "${manifest[key]}", expected "${expected}"`)
        }
      }
    },
  },
  {
    label: 'every manifest icon exists on disk with content, and one is maskable',
    async run() {
      const manifest = JSON.parse(await readFile(distPath('manifest.webmanifest'), 'utf8'))
      const icons = Array.isArray(manifest.icons) ? manifest.icons : []
      if (icons.length === 0) fail('manifest lists no icons')

      for (const icon of icons) {
        const absolute = resolveManifestAsset(String(icon.src ?? ''))
        if (!absolute) continue
        if (!existsSync(absolute))
          fail(`manifest icon "${icon.src}" resolves to a missing file (${rel(absolute)})`)

        const { size } = await stat(absolute)
        if (size === 0) fail(`manifest icon "${icon.src}" is a zero-byte file`)
      }

      const purposes = icons.map((icon) => String(icon.purpose ?? 'any'))
      if (!purposes.some((purpose) => purpose.split(/\s+/).includes('maskable'))) {
        fail('manifest has no maskable icon — Android would letterbox the mark')
      }
    },
  },
  {
    label: 'the three app icon PNGs are present in dist/icons/ with real content',
    async run() {
      for (const file of ['icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png']) {
        await requireFile(file, { minBytes: 2048 })
      }
    },
  },
  {
    label: 'build marker is baked into dist/assets/*.js',
    async run() {
      const { text } = await readBundleJs()
      const marker = process.env.VITE_BUILD_MARKER?.trim()

      if (marker) {
        if (!text.includes(marker)) fail(`build marker "${marker}" is not present in dist/assets/*.js`)
        return
      }

      if (!text.includes('Phase 0') && !text.includes('local-dev')) {
        fail(
          'no build marker found in dist/assets/*.js (expected the phase string or the "local-dev" fallback)',
        )
      }
    },
  },
  {
    label: 'no source maps were emitted',
    async run() {
      const maps = (await walk(DIST)).filter((file) => file.endsWith('.map'))
      if (maps.length > 0) fail(`source maps leaked into dist/: ${maps.map(rel).join(', ')}`)
    },
  },
]

async function main() {
  if (!existsSync(DIST)) {
    console.error(red('verify-build: dist/ does not exist — run `npm run build` first'))
    process.exit(1)
  }

  console.log('verify-build')

  for (const check of checks) {
    try {
      await check.run()
    } catch (error) {
      console.error(`  ${red('FAIL')} ${check.label}`)
      console.error(`\n${red('verify-build failed:')} ${error.message}`)
      process.exit(1)
    }

    console.log(`  ${green('OK  ')} ${check.label}`)
  }

  console.log(green(`\nAll ${checks.length} checks passed — dist/ is ready for GitHub Pages.`))
}

main().catch((error) => {
  console.error(red('verify-build crashed:'), error)
  process.exit(1)
})
