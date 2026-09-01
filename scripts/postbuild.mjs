#!/usr/bin/env node
/**
 * Post-processes `dist/` after `vite build`.
 *
 *  1. Copies index.html to 404.html. The app uses hash routing, so a deep link
 *     never actually reaches GitHub Pages as a path — this is a safety net for
 *     stale bookmarks and for anyone who trims the hash off a URL.
 *  2. Guarantees .nojekyll exists so Pages serves _-prefixed asset names.
 *  3. Prints a raw + gzip size report for every emitted asset.
 *
 * Usage: node scripts/postbuild.mjs   (wired into `npm run build`)
 */
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DIST = join(ROOT, 'dist')

function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`
}

function pad(value, width) {
  return String(value).padStart(width, ' ')
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walk(full)))
    } else {
      files.push(full)
    }
  }

  return files
}

async function main() {
  const indexHtml = join(DIST, 'index.html')

  if (!existsSync(indexHtml)) {
    console.error('postbuild: dist/index.html is missing — did `vite build` run?')
    process.exit(1)
  }

  await mkdir(DIST, { recursive: true })
  await copyFile(indexHtml, join(DIST, '404.html'))

  const nojekyll = join(DIST, '.nojekyll')
  if (!existsSync(nojekyll)) {
    await writeFile(nojekyll, '', 'utf8')
  }

  console.log('postbuild')
  console.log('  dist/404.html   <- dist/index.html (SPA fallback)')
  console.log('  dist/.nojekyll  present')

  const assetsDir = join(DIST, 'assets')
  const assets = existsSync(assetsDir) ? await walk(assetsDir) : []

  const rows = []
  for (const file of assets) {
    const { size } = await stat(file)
    const gzipped = gzipSync(await readFile(file)).length
    rows.push({ name: relative(DIST, file).replace(/\\/g, '/'), size, gzipped })
  }

  rows.sort((a, b) => b.size - a.size)

  const nameWidth = Math.max(24, ...rows.map((row) => row.name.length))
  console.log('')
  console.log(`  ${'asset'.padEnd(nameWidth)}  ${pad('raw', 10)}  ${pad('gzip', 10)}`)
  console.log(`  ${'-'.repeat(nameWidth)}  ${'-'.repeat(10)}  ${'-'.repeat(10)}`)

  for (const row of rows) {
    console.log(`  ${row.name.padEnd(nameWidth)}  ${pad(kb(row.size), 10)}  ${pad(kb(row.gzipped), 10)}`)
  }

  const totalRaw = rows.reduce((sum, row) => sum + row.size, 0)
  const totalGzip = rows.reduce((sum, row) => sum + row.gzipped, 0)
  console.log(`  ${'-'.repeat(nameWidth)}  ${'-'.repeat(10)}  ${'-'.repeat(10)}`)
  console.log(
    `  ${`total (${rows.length} files)`.padEnd(nameWidth)}  ${pad(kb(totalRaw), 10)}  ${pad(kb(totalGzip), 10)}`,
  )
}

main().catch((error) => {
  console.error('postbuild failed:', error)
  process.exit(1)
})
