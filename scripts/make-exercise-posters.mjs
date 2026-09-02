#!/usr/bin/env node
/**
 * Generates the ORIGINAL placeholder posters for the exercise catalog.
 *
 * WHAT THESE ARE, AND WHAT THEY ARE NOT. They are original abstract diagrams,
 * drawn from coordinates authored in this file — nothing is traced, scraped,
 * photographed, or derived from another product. They are NOT demonstrations.
 * A poster shows the direction of force for a MOVEMENT PATTERN against a body
 * axis and a ground reference; it deliberately contains no human figure, because
 * a figure would imply we are showing correct form, and we are not. Every
 * exercise that uses one is marked `isPlaceholder: true` in the manifest so the
 * gap is countable rather than invisible.
 *
 * ONE POSTER PER MOVEMENT PATTERN, NOT PER EXERCISE. There are 23 patterns and
 * many more exercises, and a per-exercise placeholder would be 120 copies of the
 * same lie at ten times the byte cost. The exercise's own NAME is drawn by the UI
 * over the poster at render time, which is also why no text is baked into the
 * PNGs: baked text would depend on whatever fonts the generating machine had, so
 * regenerating on another machine would produce different bytes.
 *
 * THE PATTERN LIST IS NOT RESTATED HERE. It is read out of the canonical module,
 * `src/catalog/movementPatterns/movementPatterns.ts`, and the art table below must
 * cover it exactly. Add a pattern to the catalog without drawing it and this
 * script fails loudly rather than silently shipping an exercise with no poster.
 *
 * Outputs (idempotent — always rewritten, byte-identical for identical input):
 *   public/media/posters/<movement-pattern-id>.png   480x270
 *
 * Usage: node scripts/make-exercise-posters.mjs
 */
import { mkdir, readFile, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const POSTER_DIR = join(ROOT, 'public', 'media', 'posters')
const PATTERN_SOURCE = join(ROOT, 'src', 'catalog', 'movementPatterns', 'movementPatterns.ts')

/** Output size. Authored at 640x360 and scaled down, so the geometry stays readable. */
const OUT_WIDTH = 480
const OUT_HEIGHT = 270
const BOX_WIDTH = 640
const BOX_HEIGHT = 360

/* Palette — the design tokens, restated as literals because an .mjs script cannot
 * read CSS custom properties. Keep in step with src/styles/tokens.css. */
const FIELD = '#0a0b0a' /* --wc-bg */
const AXIS = '#272b25' /* --wc-surface-3 */
const NODE = '#a8d621' /* --wc-lime-deep */
const ARROW = '#ccff33' /* --wc-lime */
const BRACE = '#dcff6b' /* --wc-lime-bright */
const REFERENCE = 'rgba(204, 255, 51, 0.24)' /* --wc-lime-edge, softened */
const IMPLEMENT = '#ccff33'

const FLOOR_Y = 312

/** The three body axes a diagram is drawn against. Abstract lines, not figures. */
const AXES = {
  vertical: { from: [250, 64], to: [250, 296] },
  horizontal: { from: [150, 212], to: [398, 212] },
  pitched: { from: [198, 132], to: [300, 288] },
}

/**
 * The art table. One row per movement pattern id.
 *
 *   axis        which body axis the force acts on
 *   nodes       working joints, as fractions along that axis (one for a
 *               single-joint pattern, two for a compound one)
 *   implements  geometric hints at the load: a bar (line plus two plates), a
 *               plate (ring), or a handle on a cable run
 *   arrows      direction of force; `bow` bends the shaft for a rotation
 *   brace       the resisted line for the anti-* patterns, where the point of
 *               the movement is that the axis does NOT move
 */
const GLYPHS = {
  'horizontal-push': {
    axis: 'horizontal',
    nodes: [0.28, 0.5],
    implements: [{ kind: 'bar', at: [212, 168], length: 104 }],
    arrows: [{ from: [212, 190], to: [212, 92] }],
    brace: null,
  },
  'horizontal-pull': {
    axis: 'vertical',
    nodes: [0.3, 0.5],
    implements: [{ kind: 'handle', at: [340, 196], cableTo: [478, 196] }],
    arrows: [{ from: [332, 196], to: [268, 196] }],
    brace: null,
  },
  'vertical-push': {
    axis: 'vertical',
    nodes: [0.26, 0.42],
    implements: [{ kind: 'bar', at: [250, 152], length: 116 }],
    arrows: [{ from: [250, 138], to: [250, 56] }],
    brace: null,
  },
  'vertical-pull': {
    axis: 'vertical',
    nodes: [0.24, 0.44],
    implements: [{ kind: 'bar', at: [250, 62], length: 148 }],
    arrows: [{ from: [250, 188], to: [250, 96] }],
    brace: null,
  },
  squat: {
    axis: 'vertical',
    nodes: [0.62, 0.8],
    implements: [{ kind: 'bar', at: [250, 128], length: 124 }],
    arrows: [{ from: [376, 268], to: [376, 140] }],
    brace: null,
  },
  hinge: {
    axis: 'pitched',
    nodes: [0.56, 0.82],
    implements: [{ kind: 'bar', at: [302, 274], length: 108 }],
    arrows: [{ from: [392, 274], to: [392, 152] }],
    brace: null,
  },
  lunge: {
    axis: 'vertical',
    nodes: [0.6, 0.82],
    implements: [{ kind: 'bar', at: [250, 128], length: 124 }],
    arrows: [
      { from: [376, 268], to: [376, 156] },
      { from: [296, 302], to: [204, 302] },
    ],
    brace: null,
  },
  'hip-extension': {
    axis: 'horizontal',
    nodes: [0.58, 0.76],
    implements: [{ kind: 'bar', at: [316, 186], length: 96 }],
    arrows: [{ from: [396, 252], to: [396, 144] }],
    brace: null,
  },
  carry: {
    axis: 'vertical',
    nodes: [0.5],
    implements: [{ kind: 'plate', at: [190, 232], radius: 22 }],
    arrows: [
      { from: [326, 200], to: [452, 200] },
      { from: [190, 262], to: [190, 300] },
    ],
    brace: null,
  },
  'calf-raise': {
    axis: 'vertical',
    nodes: [0.9],
    implements: [],
    arrows: [{ from: [340, 292], to: [340, 210] }],
    brace: null,
  },
  'knee-flexion': {
    axis: 'vertical',
    nodes: [0.78],
    implements: [{ kind: 'plate', at: [318, 292], radius: 20 }],
    arrows: [{ from: [364, 292], to: [364, 200] }],
    brace: null,
  },
  'knee-extension': {
    axis: 'vertical',
    nodes: [0.78],
    implements: [{ kind: 'plate', at: [318, 292], radius: 20 }],
    arrows: [{ from: [344, 288], to: [438, 226] }],
    brace: null,
  },
  'hip-abduction': {
    axis: 'vertical',
    nodes: [0.62],
    implements: [],
    arrows: [{ from: [300, 244], to: [424, 244] }],
    brace: null,
  },
  'hip-adduction': {
    axis: 'vertical',
    nodes: [0.62],
    implements: [],
    arrows: [{ from: [424, 244], to: [300, 244] }],
    brace: null,
  },
  'isolation-curl': {
    axis: 'vertical',
    nodes: [0.44],
    implements: [{ kind: 'plate', at: [326, 246], radius: 20 }],
    arrows: [{ from: [370, 250], to: [370, 148] }],
    brace: null,
  },
  'isolation-extension': {
    axis: 'vertical',
    nodes: [0.44],
    implements: [{ kind: 'plate', at: [326, 148], radius: 20 }],
    arrows: [{ from: [370, 144], to: [370, 246] }],
    brace: null,
  },
  'isolation-raise': {
    axis: 'vertical',
    nodes: [0.34],
    implements: [{ kind: 'plate', at: [318, 252], radius: 20 }],
    arrows: [{ from: [344, 244], to: [420, 158] }],
    brace: null,
  },
  'isolation-fly': {
    axis: 'vertical',
    nodes: [0.34],
    implements: [
      { kind: 'plate', at: [412, 196], radius: 20 },
      { kind: 'plate', at: [88, 196], radius: 20 },
    ],
    arrows: [
      { from: [386, 196], to: [300, 196] },
      { from: [114, 196], to: [200, 196] },
    ],
    brace: null,
  },
  shrug: {
    axis: 'vertical',
    nodes: [0.24],
    implements: [
      { kind: 'plate', at: [186, 250], radius: 20 },
      { kind: 'plate', at: [314, 250], radius: 20 },
    ],
    arrows: [{ from: [376, 202], to: [376, 128] }],
    brace: null,
  },
  rotation: {
    axis: 'vertical',
    nodes: [0.5],
    implements: [{ kind: 'handle', at: [352, 196], cableTo: [482, 196] }],
    arrows: [{ from: [344, 196], to: [178, 156], bow: 46 }],
    brace: null,
  },
  'anti-extension': {
    axis: 'horizontal',
    nodes: [0.5],
    implements: [],
    arrows: [{ from: [274, 122], to: [274, 184] }],
    brace: { from: [152, 240], to: [396, 240], along: 'x' },
  },
  'anti-rotation': {
    axis: 'vertical',
    nodes: [0.5],
    implements: [{ kind: 'handle', at: [364, 196], cableTo: [488, 196] }],
    arrows: [{ from: [356, 196], to: [296, 196] }],
    brace: { from: [278, 128], to: [278, 268], along: 'y' },
  },
  'anti-lateral-flexion': {
    axis: 'vertical',
    nodes: [0.5],
    implements: [{ kind: 'plate', at: [344, 250], radius: 20 }],
    arrows: [{ from: [344, 278], to: [344, 322] }],
    brace: { from: [280, 116], to: [280, 288], along: 'y' },
  },
}

/* ------------------------------------------------------------------ drawing */

const n = (value) => Number(value.toFixed(2))

function lerp(from, to, t) {
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]
}

function capsule([x1, y1], [x2, y2], width, fill) {
  return (
    `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" ` +
    `stroke="${fill}" stroke-width="${width}" stroke-linecap="round" />`
  )
}

/** The ground reference: a soft rule with evenly spaced ticks. */
function floorMarkup() {
  const ticks = []
  for (let x = 72; x <= 568; x += 32) {
    ticks.push(`<line x1="${x}" y1="${FLOOR_Y + 6}" x2="${x - 10}" y2="${FLOOR_Y + 20}" />`)
  }
  return (
    `<g stroke="${REFERENCE}" stroke-width="3" stroke-linecap="round">` +
    `<line x1="56" y1="${FLOOR_Y}" x2="584" y2="${FLOOR_Y}" />` +
    ticks.join('') +
    `</g>`
  )
}

/** A framing bracket in the top-left, so an empty-looking poster still reads as designed. */
function bracketMarkup() {
  return (
    `<g stroke="${REFERENCE}" stroke-width="3" stroke-linecap="round" fill="none">` +
    `<path d="M 40 74 L 40 40 L 74 40" />` +
    `<path d="M 600 286 L 600 320 L 566 320" />` +
    `</g>`
  )
}

function arrowMarkup({ from, to, bow = 0 }) {
  const [x1, y1] = from
  const [x2, y2] = to
  const dx = x2 - x1
  const dy = y2 - y1
  const length = Math.hypot(dx, dy)
  if (length < 1) throw new Error('An arrow needs a direction')

  // Control point for the bowed variant: the midpoint pushed along the normal.
  const mid = [x1 + dx / 2, y1 + dy / 2]
  const control = [mid[0] + (-dy / length) * bow, mid[1] + (dx / length) * bow]

  // Tangent at the tip: for a quadratic curve that is (end - control).
  const tx = x2 - control[0]
  const ty = y2 - control[1]
  const tl = Math.hypot(tx, ty)
  const ux = tx / tl
  const uy = ty / tl
  const px = -uy
  const py = ux

  const HEAD = 26
  const HALF = 14
  const base = [x2 - ux * HEAD, y2 - uy * HEAD]
  const head =
    `${n(x2)},${n(y2)} ` +
    `${n(base[0] + px * HALF)},${n(base[1] + py * HALF)} ` +
    `${n(base[0] - px * HALF)},${n(base[1] - py * HALF)}`

  // The shaft stops inside the head so the two never disagree at the seam.
  const shaftEnd = [x2 - ux * (HEAD - 3), y2 - uy * (HEAD - 3)]
  const shaft =
    bow === 0
      ? `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(shaftEnd[0])}" y2="${n(shaftEnd[1])}" />`
      : `<path d="M ${n(x1)} ${n(y1)} Q ${n(control[0])} ${n(control[1])} ${n(shaftEnd[0])} ${n(
          shaftEnd[1],
        )}" fill="none" />`

  return (
    `<g stroke="${ARROW}" stroke-width="10" stroke-linecap="round">${shaft}</g>` +
    `<polygon points="${head}" fill="${ARROW}" />`
  )
}

function implementMarkup(item) {
  if (item.kind === 'bar') {
    const [x, y] = item.at
    const half = item.length / 2
    return (
      `<g stroke="${IMPLEMENT}" stroke-width="8" stroke-linecap="round">` +
      `<line x1="${x - half}" y1="${y}" x2="${x + half}" y2="${y}" />` +
      `</g>` +
      `<g fill="${IMPLEMENT}">` +
      `<rect x="${x - half - 12}" y="${y - 22}" width="16" height="44" rx="6" />` +
      `<rect x="${x + half - 4}" y="${y - 22}" width="16" height="44" rx="6" />` +
      `</g>`
    )
  }

  if (item.kind === 'plate') {
    const [x, y] = item.at
    return (
      `<circle cx="${x}" cy="${y}" r="${item.radius}" fill="none" stroke="${IMPLEMENT}" stroke-width="9" />` +
      `<circle cx="${x}" cy="${y}" r="4" fill="${IMPLEMENT}" />`
    )
  }

  if (item.kind === 'handle') {
    const [x, y] = item.at
    const [cx, cy] = item.cableTo
    return (
      `<line x1="${x}" y1="${y}" x2="${cx}" y2="${cy}" stroke="${REFERENCE}" stroke-width="5" ` +
      `stroke-linecap="round" />` +
      `<rect x="${cx - 10}" y="${cy - 30}" width="14" height="60" rx="5" fill="${REFERENCE}" />` +
      `<rect x="${x - 10}" y="${y - 20}" width="20" height="40" rx="9" fill="${IMPLEMENT}" />`
    )
  }

  throw new Error(`Unknown implement kind: ${item.kind}`)
}

/** The resisted line: a bright rule with end caps, meaning "this must not move". */
function braceMarkup(brace) {
  const [x1, y1] = brace.from
  const [x2, y2] = brace.to
  const caps =
    brace.along === 'x'
      ? `<line x1="${x1}" y1="${y1 - 14}" x2="${x1}" y2="${y1 + 14}" />` +
        `<line x1="${x2}" y1="${y2 - 14}" x2="${x2}" y2="${y2 + 14}" />`
      : `<line x1="${x1 - 14}" y1="${y1}" x2="${x1 + 14}" y2="${y1}" />` +
        `<line x1="${x2 - 14}" y1="${y2}" x2="${x2 + 14}" y2="${y2}" />`

  return (
    `<g stroke="${BRACE}" stroke-width="6" stroke-linecap="round">` +
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-dasharray="2 16" />` +
    caps +
    `</g>`
  )
}

function posterSvg(patternId) {
  const glyph = GLYPHS[patternId]
  const axis = AXES[glyph.axis]
  if (!axis) throw new Error(`Unknown axis "${glyph.axis}" for ${patternId}`)

  const nodes = glyph.nodes
    .map((t) => {
      const [x, y] = lerp(axis.from, axis.to, t)
      return `<circle cx="${n(x)}" cy="${n(y)}" r="15" fill="${NODE}" />`
    })
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOX_WIDTH} ${BOX_HEIGHT}" width="${OUT_WIDTH}" height="${OUT_HEIGHT}" role="img" aria-label="Movement pattern diagram: ${patternId}">
  <title>${patternId}</title>
  <rect x="0" y="0" width="${BOX_WIDTH}" height="${BOX_HEIGHT}" fill="${FIELD}" />
  ${floorMarkup()}
  ${bracketMarkup()}
  ${capsule(axis.from, axis.to, 26, AXIS)}
  ${nodes}
  ${glyph.implements.map(implementMarkup).join('')}
  ${glyph.brace ? braceMarkup(glyph.brace) : ''}
  ${glyph.arrows.map(arrowMarkup).join('')}
</svg>
`
}

/* ------------------------------------------------------------------ plumbing */

/**
 * Reads MOVEMENT_PATTERN_IDS out of the canonical module. The generator must not
 * keep its own copy of the vocabulary — the whole point of a single owner is that
 * a second list cannot drift out of step with it.
 */
async function readCanonicalPatternIds() {
  const source = await readFile(PATTERN_SOURCE, 'utf8')
  const match = source.match(/export const MOVEMENT_PATTERN_IDS = \[([\s\S]*?)\] as const/)
  if (!match) {
    throw new Error(`Could not find MOVEMENT_PATTERN_IDS in ${relative(ROOT, PATTERN_SOURCE)}`)
  }
  const ids = [...match[1].matchAll(/'([a-z0-9-]+)'/g)].map((hit) => hit[1])
  if (ids.length === 0) throw new Error('MOVEMENT_PATTERN_IDS parsed as empty')
  return ids
}

function assertGlyphCoverage(patternIds) {
  const drawn = new Set(Object.keys(GLYPHS))
  const missing = patternIds.filter((id) => !drawn.has(id))
  const extra = [...drawn].filter((id) => !patternIds.includes(id))

  if (missing.length > 0) {
    throw new Error(`No poster is drawn for: ${missing.join(', ')}. Add a row to GLYPHS in this script.`)
  }
  if (extra.length > 0) {
    throw new Error(`GLYPHS draws patterns that no longer exist: ${extra.join(', ')}.`)
  }
}

async function rasterize(browser, { svg, out }) {
  const page = await browser.newPage({
    viewport: { width: OUT_WIDTH, height: OUT_HEIGHT },
    deviceScaleFactor: 1,
  })
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8" /><style>
       html, body { margin: 0; padding: 0; background: ${FIELD}; }
       svg { display: block; }
     </style></head><body>${svg}</body></html>`,
    { waitUntil: 'load' },
  )
  await page.screenshot({ path: out, type: 'png' })
  await page.close()
}

async function main() {
  const patternIds = await readCanonicalPatternIds()
  assertGlyphCoverage(patternIds)
  await mkdir(POSTER_DIR, { recursive: true })

  console.log(`Workout Conductor placeholder posters — ${patternIds.length} movement patterns`)
  console.log(`  source of truth: ${relative(ROOT, PATTERN_SOURCE).replace(/\\/g, '/')}`)
  console.log('')

  const written = []
  const browser = await chromium.launch()
  try {
    for (const patternId of patternIds) {
      const out = join(POSTER_DIR, `${patternId}.png`)
      await rasterize(browser, { svg: posterSvg(patternId), out })
      const { size } = await stat(out)
      written.push({ patternId, size })
      console.log(
        `  wrote ${relative(ROOT, out).replace(/\\/g, '/')}` +
          `${' '.repeat(Math.max(1, 46 - relative(ROOT, out).length))}(${(size / 1024).toFixed(1)} KB)`,
      )
    }
  } finally {
    await browser.close()
  }

  // Anything left over from a pattern that no longer exists is a stale asset, and
  // a stale asset is one nobody wrote a licence row for. Say so rather than leave it.
  const onDisk = existsSync(POSTER_DIR) ? await readdir(POSTER_DIR) : []
  const expected = new Set(patternIds.map((id) => `${id}.png`))
  const orphans = onDisk.filter((file) => file.endsWith('.png') && !expected.has(file))
  if (orphans.length > 0) {
    console.warn('')
    console.warn(`  stale posters, delete them and their register rows: ${orphans.join(', ')}`)
  }

  const total = written.reduce((sum, item) => sum + item.size, 0)
  console.log('')
  console.log(`  ${written.length} posters, ${(total / 1024).toFixed(1)} KB total`)
  console.log('')
  console.log('  Paste into PLACEHOLDER_POSTER_BYTES in src/catalog/media/mediaManifest.ts:')
  console.log('')
  for (const { patternId, size } of written) {
    const key = /^[a-z][a-z0-9]*$/.test(patternId) ? patternId : `'${patternId}'`
    console.log(`    ${key}: ${size},`)
  }

  // The byte table in the manifest is transcribed by hand, not generated into a
  // sidecar file, so the manifest stays plain data a reviewer can read and
  // public/ stays nothing but shipped assets. The manifest's test compares every
  // number against the file on disk, so a stale transcription fails CI rather
  // than shipping a manifest that lies about what it ships.
}

main().catch((error) => {
  console.error('make-exercise-posters failed:', error)
  process.exitCode = 1
})
