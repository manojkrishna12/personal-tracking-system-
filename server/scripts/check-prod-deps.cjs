#!/usr/bin/env node
// Pre-start production dependency check.
//
// Runs automatically before `npm start` (npm lifecycle `prestart`). Scans the
// compiled dist/ output for every bare require() specifier and verifies each
// one resolves from the installed node_modules tree. If anything is missing it
// prints the exact module name + which compiled file needs it and exits 1, so
// a Render-style failure names the culprit instead of a cryptic MODULE_NOT_FOUND.
//
// Pure Node, no dependencies — safe to run before anything else loads.

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const distDir = path.join(root, 'dist')

function walk(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full)
  }
  return out
}

function collectBareSpecifiers(file) {
  const src = fs.readFileSync(file, 'utf8')
  const specifiers = new Set()
  const re = /require\(\s*["']([^"']+)["']\s*\)/g
  let m
  while ((m = re.exec(src)) !== null) {
    const spec = m[1]
    // Skip relative files, node builtins, and already-verified entries.
    if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('node:')) continue
    specifiers.add(spec)
  }
  return specifiers
}

let missing = []
let verified = 0
const seen = new Set()

if (!fs.existsSync(distDir)) {
  console.error('✗ dist/ not found — run `npm run build` before `npm start`.')
  process.exit(1)
}

for (const file of walk(distDir)) {
  for (const spec of collectBareSpecifiers(file)) {
    const key = spec
    if (seen.has(key)) continue
    seen.add(key)
    try {
      require.resolve(spec, { paths: [path.dirname(file), root] })
      verified++
    } catch {
      missing.push({ spec, file: path.relative(root, file) })
    }
  }
}

if (missing.length > 0) {
  console.error(`✗ PRODUCTION DEPENDENCY CHECK FAILED — ${missing.length} module(s) cannot be resolved:`)
  for (const { spec, file } of missing) {
    console.error(`  - "${spec}" (required by ${file})`)
  }
  console.error('  Install the missing package and commit the lockfile, then redeploy.')
  process.exit(1)
}

console.log(`✓ production dependency check passed (${verified} runtime module(s) verified from dist/)`)
