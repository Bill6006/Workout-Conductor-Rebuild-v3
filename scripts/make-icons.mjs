#!/usr/bin/env node
/**
 * Generates the Workout Conductor app mark.
 *
 * The mark is an original glyph: a conductor's baton sweeping across a set of
 * equalizer bars, in lime on a near-black field. Geometry is authored once in a
 * 280x280 local box and scaled into each canvas, so the favicon, the "any"
 * icons, and the maskable icon are the same drawing at different safe margins.
 *
 * Outputs (idempotent — always rewritten):
 *   public/icons/favicon.svg      vector, rounded field, transparent corners
 *   public/icons/icon-192.png     192x192, purpose "any"
 *   public/icons/icon-512.png     512x512, purpose "any"
 *   public/icons/maskable-512.png 512x512, purpose "maskable", full bleed
 *
 * Usage: node scripts/make-icons.mjs
 */
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ICONS_DIR = join(ROOT, 'public', 'icons')

const FIELD = '#0a0b0a'
const MARK = '#ccff33'

/** Local authoring box for the glyph. */
const GLYPH_BOX = 280

/** Equalizer bars, centred on the glyph midline. */
const BAR_MID_Y = 140
const BAR_WIDTH = 32
const BARS = [
  { x: 40, height: 96 },
  { x: 96, height: 168 },
  { x: 152, height: 232 },
  { x: 208, height: 132 },
]

/** Baton: a ball handle at the lower left, tapering to a tip at the upper right. */
const KNOB = { x: 44, y: 236, r: 20 }
const TIP = { x: 250, y: 44 }
const SHAFT_HALF_WIDTH_AT_KNOB = 11
const SHAFT_HALF_WIDTH_AT_TIP = 4.5
/** Charcoal gap that separates the baton from the bars it crosses. */
const KNOCKOUT_WIDTH = 18

function batonShaftPoints() {
  const dx = TIP.x - KNOB.x
  const dy = TIP.y - KNOB.y
  const length = Math.hypot(dx, dy)
  const ux = dx / length
  const uy = dy / length
  const px = -uy
  const py = ux

  const baseX = KNOB.x + ux * 6
  const baseY = KNOB.y + uy * 6

  const points = [
    [baseX + px * SHAFT_HALF_WIDTH_AT_KNOB, baseY + py * SHAFT_HALF_WIDTH_AT_KNOB],
    [TIP.x + px * SHAFT_HALF_WIDTH_AT_TIP, TIP.y + py * SHAFT_HALF_WIDTH_AT_TIP],
    [TIP.x - px * SHAFT_HALF_WIDTH_AT_TIP, TIP.y - py * SHAFT_HALF_WIDTH_AT_TIP],
    [baseX - px * SHAFT_HALF_WIDTH_AT_KNOB, baseY - py * SHAFT_HALF_WIDTH_AT_KNOB],
  ]

  return points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
}

function glyphMarkup() {
  const bars = BARS.map(
    ({ x, height }) =>
      `<rect x="${x}" y="${BAR_MID_Y - height / 2}" width="${BAR_WIDTH}" height="${height}" rx="${
        BAR_WIDTH / 2
      }" fill="${MARK}" />`,
  ).join('\n      ')

  const shaft = batonShaftPoints()
  const baton = (fill, stroke, strokeWidth) =>
    `<g fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round">` +
    `<polygon points="${shaft}" />` +
    `<circle cx="${KNOB.x}" cy="${KNOB.y}" r="${KNOB.r}" />` +
    `</g>`

  return [
    bars,
    // Knockout pass first: paints the charcoal gap, then the lime baton on top.
    baton(FIELD, FIELD, KNOCKOUT_WIDTH),
    baton(MARK, MARK, 3),
  ].join('\n      ')
}

/**
 * @param {{ canvas?: number, glyph?: number, corner?: number, fullBleed?: boolean }} options
 */
function markSvg({ canvas = 512, glyph = 340, corner = 112, fullBleed = false } = {}) {
  const scale = glyph / GLYPH_BOX
  const offset = (canvas - glyph) / 2
  const radius = fullBleed ? 0 : corner
  const field =
    `<rect x="0" y="0" width="${canvas}" height="${canvas}" rx="${radius}" fill="${FIELD}" />` +
    `<rect x="0" y="0" width="${canvas}" height="${canvas}" rx="${radius}" fill="url(#wcWash)" />`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas} ${canvas}" width="${canvas}" height="${canvas}" role="img" aria-label="Workout Conductor">
  <title>Workout Conductor</title>
  <defs>
    <radialGradient id="wcWash" cx="28%" cy="18%" r="88%">
      <stop offset="0" stop-color="${MARK}" stop-opacity="0.1" />
      <stop offset="0.55" stop-color="${MARK}" stop-opacity="0.025" />
      <stop offset="1" stop-color="${MARK}" stop-opacity="0" />
    </radialGradient>
  </defs>
  ${field}
  <g transform="translate(${offset} ${offset}) scale(${scale.toFixed(6)})">
      ${glyphMarkup()}
  </g>
</svg>
`
}

async function rasterize(browser, { svg, size, out, omitBackground }) {
  const sized = svg.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`)
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  })

  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8" /><style>
       html, body { margin: 0; padding: 0; background: transparent; }
       svg { display: block; }
     </style></head><body>${sized}</body></html>`,
    { waitUntil: 'load' },
  )
  await page.screenshot({ path: out, type: 'png', omitBackground })
  await page.close()
}

async function report(path) {
  const { size } = await stat(path)
  console.log(`  wrote ${relative(ROOT, path).replace(/\\/g, '/')}  (${(size / 1024).toFixed(1)} KB)`)
}

async function main() {
  await mkdir(ICONS_DIR, { recursive: true })

  // Rounded field with transparent corners — reads correctly as a favicon and as
  // an Android/iOS "any" icon.
  const anySvg = markSvg({ canvas: 512, glyph: 340, corner: 112, fullBleed: false })
  // Maskable: full-bleed background, glyph pulled inside the central 80% circle.
  const maskableSvg = markSvg({ canvas: 512, glyph: 288, fullBleed: true })

  const faviconPath = join(ICONS_DIR, 'favicon.svg')
  await writeFile(faviconPath, anySvg, 'utf8')

  console.log('Workout Conductor icons')
  await report(faviconPath)

  const browser = await chromium.launch()
  try {
    const targets = [
      { svg: anySvg, size: 192, file: 'icon-192.png', omitBackground: true },
      { svg: anySvg, size: 512, file: 'icon-512.png', omitBackground: true },
      { svg: maskableSvg, size: 512, file: 'maskable-512.png', omitBackground: false },
    ]

    for (const target of targets) {
      const out = join(ICONS_DIR, target.file)
      await rasterize(browser, {
        svg: target.svg,
        size: target.size,
        out,
        omitBackground: target.omitBackground,
      })
      await report(out)
    }
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error('make-icons failed:', error)
  process.exitCode = 1
})
