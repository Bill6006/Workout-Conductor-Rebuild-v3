#!/usr/bin/env node
/**
 * Privacy, secret, and third-party-network scan.
 *
 * Workout Conductor is local-first. That rule has two halves and this script
 * enforces both:
 *   1. The repository must contain only source code, blank defaults, synthetic
 *      data, and safe assets. Nothing that belongs to a real person — no
 *      addresses, no phone numbers, no credentials, no exported workout
 *      history — may ever be committed or shipped.
 *   2. The app must not talk to anybody. No CDNs, no web fonts, no analytics,
 *      no telemetry, no remote endpoints. Any absolute http(s) origin outside
 *      the allowlist below is a finding.
 *
 * Three passes run:
 *   1. Source pass   — walks the working tree (skipping build output, binaries,
 *      and the lockfile) and applies every rule.
 *   2. Lockfile pass — package-lock.json is far too noisy for the text rules
 *      (it is a directory of every dependency's homepage and author), but it is
 *      a real file in the repository and a pasted token would live there
 *      forever. The credential rules always run over it.
 *   3. Bundle pass   — if dist/ exists, re-checks every emitted text file with
 *      the credential rules, the PII rules, and the external-origin rule. The
 *      PII rules were measured against a real production build before being
 *      promoted here; they do not false-positive on minified output.
 *
 * .gitignore is deliberately NOT consulted. A leaked token in an untracked file
 * is still a leak sitting on disk, one `git add -A` away from history, and this
 * app has no server and therefore no legitimate reason to hold a secret in a
 * local `.env`. The generated directories that would otherwise make that choice
 * expensive (dist/ for the source pass, coverage/, playwright-report/,
 * test-results/, dev-dist/) are listed in SKIP_DIRS, so a CI run can never be
 * blocked by test output.
 *
 * Suppression is rule-scoped and deliberately narrow. A line may opt one
 * non-credential rule out with a `privacy-scan-allow:<rule-id>` marker — for
 * example `privacy-scan-allow:home-path`. A bare marker does nothing, one rule
 * id never silences another, and the credential rules cannot be suppressed at
 * all. If a real secret is ever committed, no comment can hide it.
 *
 * Usage: node scripts/privacy-scan.mjs   (`npm run privacy:scan`)
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** `privacy-scan-allow:<rule-id>` — the id is required and is matched exactly. */
const SUPPRESSION_PATTERN = /privacy-scan-allow:\s*([a-z0-9-]+)/g

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'dev-dist',
  'coverage',
  'playwright-report',
  'test-results',
  '.vite',
  '.vscode',
  '.idea',
])

const LOCKFILE = 'package-lock.json'

/** Excluded from the general walk. The lockfile gets its own credential-only pass. */
const SKIP_FILES = new Set([LOCKFILE, '.DS_Store'])

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.avif',
  '.gif',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.pdf',
  '.zip',
  '.mp4',
  '.webm',
])

const MAX_FILE_BYTES = 2 * 1024 * 1024

/**
 * The only extensions allowed to go unscanned because of their size. Binary
 * assets never reach the size check (the walk drops them first), so in practice
 * every oversized *text* file is a hard failure: an unscanned file is not a
 * clean file, and silently counting it as one is how a gate stops being a gate.
 */
const OVERSIZE_ALLOWED_EXTENSIONS = BINARY_EXTENSIONS

const EMAIL_ALLOWLIST = [
  (value) => value.toLowerCase().startsWith('noreply@'),
  (value) => /@(?:[a-z0-9-]+\.)*example\.(?:com|org|net)$/i.test(value),
  (value) => /@users\.noreply\.github\.com$/i.test(value),
]

/**
 * Hosts this project is allowed to name. Everything here is either where the
 * repository itself lives, a namespace URI that is never fetched, the local
 * dev/preview server, or an error-message URL that React, React Router, and
 * Workbox bake into their own bundles. The vendor entries were verified by
 * running this rule over a production dist/ and reading every hit.
 */
const ORIGIN_ALLOWED_HOSTS = new Set([
  'github.com',
  'raw.githubusercontent.com',
  'registry.npmjs.org',
  'www.w3.org',
  // JSON Schema dialect identifiers, not endpoints. zod's to-json-schema module
  // writes one of three fixed strings into the `$schema` field of the object it
  // returns — https://json-schema.org/draft/2020-12/schema,
  // http://json-schema.org/draft-07/schema#, and .../draft-04/schema# — exactly
  // as `www.w3.org` appears in an SVG xmlns. Verified in
  // node_modules/zod/v4/core/to-json-schema.js: all three are `result.$schema =`
  // assignments, there is no fetch/XHR/import anywhere near them, and the app
  // never calls the function at all (the strings survive only because they are
  // string literals in a module the bundler could not fully tree-shake). No
  // network request is ever made to this host.
  'json-schema.org',
  'localhost',
  '127.0.0.1',
  // Framework error-message URLs found in dist/assets/*.js and dist/sw.js.
  'react.dev',
  'reactjs.org',
  'reactrouter.com',
  'remix.run',
])

/** Suffix matches, so `bill6006.github.io` and any future Pages host pass. */
const ORIGIN_ALLOWED_SUFFIXES = ['.github.io']

/**
 * Exact URLs, not hosts. Workbox logs this shortlink in a console warning; the
 * shortener itself stays untrusted for every other path.
 */
const ORIGIN_ALLOWED_URLS = ['https://bit.ly/wb-precache']

/**
 * Known-bad families. These are checked before the allowlist, so adding one of
 * them to ORIGIN_ALLOWED_HOSTS later does nothing — a deliberate ratchet.
 * Matched as the host itself or any subdomain of it.
 */
const ORIGIN_DENIED_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net',
  'jsdelivr.net',
  'unpkg.com',
  'cdnjs.cloudflare.com',
  'google-analytics.com',
  'googletagmanager.com',
  'sentry.io',
  'plausible.io',
]

/** Any host containing one of these is denied outright, subdomain or not. */
const ORIGIN_DENIED_SUBSTRINGS = ['analytics', 'telemetry']

function originHost(url) {
  const withoutScheme = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
  const authority = withoutScheme.split(/[/?#]/, 1)[0]
  const hostAndPort = authority.includes('@') ? authority.slice(authority.lastIndexOf('@') + 1) : authority
  // Split rather than strip `:\d+`, so an interpolated port (`localhost:${PORT}`)
  // still resolves to its host instead of looking like an unknown one.
  return hostAndPort.split(':', 1)[0].toLowerCase()
}

function hostMatches(host, candidate) {
  return host === candidate || host.endsWith(`.${candidate}`)
}

function isAllowedOrigin(url) {
  const host = originHost(url)
  if (!host) return false

  if (ORIGIN_DENIED_SUBSTRINGS.some((needle) => host.includes(needle))) return false
  if (ORIGIN_DENIED_HOSTS.some((denied) => hostMatches(host, denied))) return false

  if (ORIGIN_ALLOWED_URLS.some((allowed) => url === allowed || url.startsWith(`${allowed}/`))) return true
  if (ORIGIN_ALLOWED_HOSTS.has(host)) return true
  if (ORIGIN_ALLOWED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true

  return false
}

/**
 * `scope: 'source'` rules run over the working tree only. `scope: 'all'` rules
 * also run over the built bundle. `credential: true` rules can never be
 * suppressed and always run over the lockfile too.
 *
 * No rule pattern below matches its own source text: every pattern is escaped
 * where a literal would be (`ghr)_`, `AKIA[`, `-{5}BEGIN`), and the host lists
 * above are written bare, without a scheme. This file therefore carries no
 * suppression markers at all, and the scan passing over itself proves it.
 */
const RULES = [
  {
    id: 'email-address',
    label: 'email address',
    scope: 'all',
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g,
    allow: (value) => EMAIL_ALLOWLIST.some((test) => test(value)),
  },
  {
    id: 'phone-number',
    label: 'phone number',
    // Measured against a production dist/ and package-lock.json: zero hits, so
    // this is safe on minified output rather than source-only out of caution.
    scope: 'all',
    // Parenthesised area code with no separator, an optional +1 country prefix,
    // and dot / space / dash separators. A bare run of ten digits is NOT matched
    // on purpose — that is where hashes and minified numerics false-positive.
    pattern:
      /(?:\+1[-. ]?\(?\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}|\(\d{3}\)[-. ]?\d{3}[-. ]?\d{4}|\b\d{3}[-. ]\d{3}[-. ]\d{4})\b/g,
  },
  {
    id: 'external-origin',
    label: 'third-party network origin',
    scope: 'all',
    redact: false,
    pattern: /\bhttps?:\/\/[^\s"'`<>()[\]{},;\\]+/gi,
    allow: (value) => isAllowedOrigin(value),
  },
  {
    // Protocol-relative references — a bare double slash followed directly by
    // a CDN host — inherit the page scheme, so the absolute-URL rule above
    // misses them entirely. Requiring a dotted host immediately after the
    // slashes keeps ordinary `// comment` lines out of the match.
    id: 'external-origin-protocol-relative',
    label: 'third-party network origin (protocol-relative)',
    scope: 'all',
    redact: false,
    pattern: /(?<![:\w/])\/\/[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.[a-z]{2,}\//gi,
    allow: (value) => isAllowedOrigin(`https:${value}`),
  },
  {
    id: 'github-token',
    label: 'GitHub token',
    scope: 'all',
    credential: true,
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/g,
  },
  {
    id: 'github-pat',
    label: 'GitHub fine-grained PAT',
    scope: 'all',
    credential: true,
    pattern: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g,
  },
  {
    id: 'openai-key',
    label: 'OpenAI-style API key',
    scope: 'all',
    credential: true,
    pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    id: 'aws-access-key',
    label: 'AWS access key id',
    scope: 'all',
    credential: true,
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    id: 'google-api-key',
    label: 'Google API key',
    scope: 'all',
    credential: true,
    pattern: /\bAIza[0-9A-Za-z_-]{30,}/g,
  },
  {
    id: 'slack-token',
    label: 'Slack token',
    scope: 'all',
    credential: true,
    pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  },
  {
    id: 'private-key',
    label: 'private key block',
    scope: 'all',
    credential: true,
    pattern: /-{5}BEGIN (?:RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY-{5}/g,
  },
  {
    id: 'home-path',
    label: 'local home directory path',
    // docs/ is exactly where a pasted local path ends up, so it is scanned like
    // everything else. A document that must show a path shape uses a
    // placeholder or an explicit `privacy-scan-allow:home-path` marker.
    scope: 'all',
    pattern: /(?:C:\\Users\\|\/Users\/)/g,
  },
]

const CREDENTIAL_RULES = RULES.filter((rule) => rule.credential)
const BUNDLE_RULES = RULES.filter((rule) => rule.scope === 'all')

/** Top-level keys that mark a file as exported user data rather than fixtures. */
const EXPORT_KEYS = ['workoutHistory', 'sessions', 'personalRecords', 'backupVersion']

function toPosix(value) {
  return value.replace(/\\/g, '/')
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function redact(value) {
  const head = value.slice(0, 4)
  const hidden = Math.max(value.length - 4, 0)
  return `${head}${'*'.repeat(Math.min(hidden, 20))} (${value.length} chars)`
}

async function walk(dir, files = []) {
  const entries = await readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const full = join(dir, entry.name)

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      await walk(full, files)
      continue
    }

    if (!entry.isFile()) continue
    if (SKIP_FILES.has(entry.name)) continue
    if (BINARY_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue

    files.push(full)
  }

  return files
}

/**
 * Returns `{ status, text, size }`. `status` is 'ok', 'too-large', or 'binary'.
 * Callers must act on the non-ok statuses rather than treating them as clean.
 */
async function readTextFile(absolute) {
  const { size } = await stat(absolute)
  if (size > MAX_FILE_BYTES) return { status: 'too-large', text: null, size }

  const text = await readFile(absolute, 'utf8')
  // A NUL byte means this is binary regardless of its extension.
  if (text.includes('\u0000')) return { status: 'binary', text: null, size }

  return { status: 'ok', text, size }
}

function suppressedRuleIds(line) {
  const ids = new Set()
  SUPPRESSION_PATTERN.lastIndex = 0
  let match
  while ((match = SUPPRESSION_PATTERN.exec(line)) !== null) ids.add(match[1])
  return ids
}

function scanText({ relPath, text, rules }) {
  const findings = []
  const lines = text.split(/\r?\n/)
  const suppressions = lines.map((line) =>
    line.includes('privacy-scan-allow') ? suppressedRuleIds(line) : null,
  )

  for (const rule of rules) {
    if (rule.skipFile?.(relPath)) continue

    lines.forEach((line, index) => {
      // Credential rules are never suppressible, by any marker, in any file.
      if (!rule.credential && suppressions[index]?.has(rule.id)) return

      rule.pattern.lastIndex = 0
      let match
      while ((match = rule.pattern.exec(line)) !== null) {
        const value = match[0]
        if (rule.allow?.(value)) continue
        findings.push({
          file: relPath,
          line: index + 1,
          rule: rule.label,
          value,
          redact: rule.redact !== false,
        })
      }
    })
  }

  return findings
}

/** Runs on every .json the walk yields, wherever it sits in the tree. */
function scanExportedData({ relPath, text }) {
  if (extname(relPath).toLowerCase() !== '.json') return []

  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return []
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return []

  return EXPORT_KEYS.filter((key) => key in parsed).map((key) => ({
    file: relPath,
    line: 1,
    rule: 'exported user data',
    value: key,
    redact: false,
  }))
}

/**
 * Reads one file and applies `rules`. Size and binary skips are recorded rather
 * than swallowed, and only files that were actually read count as scanned.
 */
async function scanFile({ absolute, rules, exportedData = true, report }) {
  const relPath = toPosix(relative(ROOT, absolute))
  const { status, text, size } = await readTextFile(absolute)

  if (status === 'too-large') {
    const exempt = OVERSIZE_ALLOWED_EXTENSIONS.has(extname(relPath).toLowerCase())
    report.oversized.push({ file: relPath, size, exempt })
    return
  }

  if (status === 'binary') {
    report.binary.push({ file: relPath, size })
    return
  }

  report.scanned += 1
  report.findings.push(...scanText({ relPath, text, rules }))
  if (exportedData) report.findings.push(...scanExportedData({ relPath, text }))
}

function emptyReport() {
  return { scanned: 0, findings: [], oversized: [], binary: [] }
}

async function scanSource() {
  const report = emptyReport()
  for (const absolute of await walk(ROOT)) {
    await scanFile({ absolute, rules: RULES, report })
  }
  return report
}

async function scanLockfile() {
  const report = emptyReport()
  const absolute = join(ROOT, LOCKFILE)
  if (!existsSync(absolute)) return report

  await scanFile({ absolute, rules: CREDENTIAL_RULES, exportedData: false, report })
  return report
}

async function scanBundle() {
  const report = emptyReport()
  const dist = join(ROOT, 'dist')
  if (!existsSync(dist)) return report

  const bundleExtensions = new Set([
    '.js',
    '.mjs',
    '.css',
    '.html',
    '.webmanifest',
    '.json',
    '.svg',
    '.txt',
    '.md',
    '.xml',
  ])
  const files = (await walk(dist)).filter((file) => bundleExtensions.has(extname(file).toLowerCase()))

  for (const absolute of files) {
    await scanFile({ absolute, rules: BUNDLE_RULES, report })
  }

  return report
}

function printFindings(title, findings) {
  console.error(`\n${title}`)
  for (const finding of findings) {
    const shown = finding.redact ? redact(finding.value) : finding.value
    console.error(`  ${finding.file}:${finding.line}  [${finding.rule}]  ${shown}`)
  }
}

function printSkips(reports) {
  const oversized = reports.flatMap((report) => report.oversized)
  const binary = reports.flatMap((report) => report.binary)

  for (const skip of binary) {
    console.log(`  skipped (binary content): ${skip.file} — ${formatBytes(skip.size)}`)
  }

  for (const skip of oversized) {
    const note = skip.exempt ? 'exempt extension' : 'NOT SCANNED'
    console.error(
      `  skipped (over ${formatBytes(MAX_FILE_BYTES)}): ${skip.file} — ${formatBytes(skip.size)} [${note}]`,
    )
  }

  return oversized.filter((skip) => !skip.exempt)
}

async function main() {
  const source = await scanSource()
  const lockfile = await scanLockfile()
  const bundle = await scanBundle()
  const reports = [source, lockfile, bundle]

  console.log('privacy scan')
  console.log(`  source files scanned: ${source.scanned}`)
  console.log(`  lockfile scanned:     ${lockfile.scanned} (credential rules only)`)
  console.log(
    bundle.scanned > 0
      ? `  bundle files scanned: ${bundle.scanned}`
      : '  bundle files scanned: 0 (no dist/ — run after a build for full coverage)',
  )

  const unscannable = printSkips(reports)
  const findings = reports.flatMap((report) => report.findings)

  if (findings.length === 0 && unscannable.length === 0) {
    console.log('PASS — no personal data, credentials, third-party origins, or exported user data found.')
    return
  }

  if (source.findings.length > 0) printFindings('FAIL — findings in tracked source:', source.findings)
  if (lockfile.findings.length > 0) printFindings('FAIL — findings in package-lock.json:', lockfile.findings)
  if (bundle.findings.length > 0) printFindings('FAIL — findings in built bundle:', bundle.findings)

  if (unscannable.length > 0) {
    console.error(`\nFAIL — ${unscannable.length} file(s) were too large to scan and are not exempt.`)
    console.error('Shrink the file, remove it, or add its extension to OVERSIZE_ALLOWED_EXTENSIONS.')
  }

  if (findings.length > 0) {
    console.error(
      `\n${findings.length} finding(s). Credential and PII values are redacted past 4 characters.`,
    )
    console.error(
      'Remove the data, or add a `privacy-scan-allow:<rule-id>` marker if the match is provably safe.',
    )
    console.error('Credential rules cannot be suppressed.')
  }

  process.exit(1)
}

main().catch((error) => {
  console.error('privacy-scan failed:', error)
  process.exit(1)
})
