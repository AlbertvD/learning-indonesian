// scripts/build-public-pages.ts — emit one static HTML file per public route.
//
// Runs AFTER `vite build`, chained inside package.json's `build` script. That
// placement is load-bearing: Cloudflare Workers Builds runs the repo's build
// script and nothing else, so a step invoked separately would work locally and
// be silently absent from every cloud deploy.
//
// ── Why this exists
//
// Every public route used to serve one byte-identical dist/index.html, because
// `not_found_handling: "single-page-application"` (wrangler.jsonc) returns that
// file for any path with no matching asset. So /leenwoorden and /hoe-het-werkt
// both declared `rel="canonical" href="https://kamoebisa.nl/"` — telling Google
// they are duplicates of the homepage, in direct contradiction of sitemap.xml,
// which submits them as distinct URLs. Link unfurlers (WhatsApp, Signal,
// LinkedIn) read the head and never run JavaScript, so a shared /leenwoorden
// link rendered as the homepage every single time.
//
// ── How it works, and why it needs no config change
//
// Two Cloudflare behaviours, both verified against their docs before this was
// written rather than assumed:
//
//   1. An exact asset match is served WITHOUT invoking not_found_handling, which
//      only fires when nothing matches. So the SPA fallback keeps serving
//      /leren, /lesson/<id> and every gated route exactly as before.
//   2. `html_handling` defaults to "auto-trailing-slash" and is unset in
//      wrangler.jsonc, so dist/<path>/index.html is served at /<path>.
//
// The homelab's nginx resolves the same layout via `try_files $uri $uri/
// /index.html` (nginx.conf:68), so one build output serves both deployments.
//
// ⚠️ dist/index.html is NEVER touched. It already carries the homepage's correct
// head, and rewriting it post-build would desync the service worker's precache
// entry — vite-plugin-pwa computes {url:"index.html",revision:<hash>} during
// `vite build`, from the file as Vite left it. The emitted files are likewise
// absent from that manifest and are served from the network, which is correct.
//
// Spec: docs/plans/2026-08-19-public-page-discoverability.md

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PUBLIC_ROUTES, type PublicRoute } from '../src/pages/publicRoutes'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const ORIGIN = 'https://kamoebisa.nl'

/**
 * Replace the CONTENT of one tag, matched by a distinguishing attribute.
 *
 * Deliberately not a DOM parse: the template is our own file, the tags are
 * known, and pulling in a parser to rewrite seven attributes would be mechanism
 * this does not need. The trade is that a silent miss is possible — which is why
 * every swap is verified below and asserted again against the live site by
 * `make check-cloud-config`.
 */
function swap(html: string, pattern: RegExp, replacement: string, label: string): string {
  const before = html
  const out = html.replace(pattern, replacement)
  if (out === before) {
    throw new Error(
      `build-public-pages: could not find ${label} in dist/index.html.\n` +
        `The head template changed shape — update the pattern in this script, or ` +
        `every public page will silently ship the homepage's head.`,
    )
  }
  return out
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

const COMMENT = /<!--[\s\S]*?-->/g

/**
 * Hide HTML comments, run `fn`, put them back.
 *
 * Not optional, and not defensive coding — without it this script shipped the
 * wrong output on its first run. index.html's head carries a provenance comment
 * that contains the literal text `<title>Kamoe Bisa</title>` (index.html:30,
 * explaining what the page used to carry). It sits ABOVE the real <title> on
 * line 34, so `html.replace(/<title>...<\/title>/, ...)` rewrote the comment and
 * left the actual tag alone — every emitted page kept the homepage's title.
 *
 * The verification below passed anyway, because it asked "does the document
 * contain this string" and the answer was yes: inside a comment. So the swap and
 * the check BOTH run against the masked document now — a tag that only appears
 * in prose can neither be written nor satisfy the assertion.
 */
function outsideComments(html: string, fn: (masked: string) => string): string {
  const stash: string[] = []
  // A printable sentinel rather than a control character: the template is our
  // own file and provably contains no such text (asserted below), and NUL in a
  // regex trips no-control-regex.
  const mark = (i: number) => `%%KB_COMMENT_${i}%%`
  if (html.includes('%%KB_COMMENT_')) {
    throw new Error('build-public-pages: index.html contains the masking sentinel — pick another.')
  }
  const masked = html.replace(COMMENT, match => {
    stash.push(match)
    return mark(stash.length - 1)
  })
  return fn(masked).replace(/%%KB_COMMENT_(\d+)%%/g, (_, i) => stash[Number(i)])
}

function buildPage(template: string, route: PublicRoute): string {
  return outsideComments(template, masked => buildHead(masked, route))
}

/**
 * Remove the homepage's JSON-LD from a sibling page.
 *
 * index.html declares a `Course` with a subscription `Offer` and
 * `"url": "https://kamoebisa.nl/"`. That is correct for the homepage and wrong
 * everywhere else: copying the head wholesale left the privacy policy, the terms
 * and the refund policy each advertising a course price, and every emitted page
 * asserting a `url` that contradicted its own canonical. Observed live on
 * 2026-08-19, caused by the emitter's first version.
 *
 * Stripping is the right fix rather than rewriting: structured data describing
 * the product belongs on the page that sells it. If a sibling page ever earns
 * its own schema — an ItemList for the loanwords, say — that is a deliberate
 * addition, not something it should inherit by accident.
 */
function stripProductSchema(html: string): string {
  const out = html.replace(/\n\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')
  if (out === html) {
    throw new Error(
      'build-public-pages: no JSON-LD block found in dist/index.html.\n' +
        'If it was removed on purpose, delete this call; if it changed shape, update the pattern — ' +
        'otherwise every sibling page silently re-inherits the homepage Course/Offer schema.',
    )
  }
  return out
}

function buildHead(template: string, route: PublicRoute): string {
  const url = ORIGIN + route.path
  const title = escapeAttr(route.title)
  const description = escapeAttr(route.description)

  let html = stripProductSchema(template)
  html = swap(html, /<title>[^<]*<\/title>/, `<title>${title}</title>`, '<title>')
  html = swap(
    html,
    /<meta name="description" content="[^"]*" \/>/,
    `<meta name="description" content="${description}" />`,
    'meta description',
  )
  html = swap(
    html,
    /<link rel="canonical" href="[^"]*" \/>/,
    `<link rel="canonical" href="${url}" />`,
    'canonical',
  )
  html = swap(
    html,
    /<meta property="og:url" content="[^"]*" \/>/,
    `<meta property="og:url" content="${url}" />`,
    'og:url',
  )
  html = swap(
    html,
    /<meta property="og:title" content="[^"]*" \/>/,
    `<meta property="og:title" content="${title}" />`,
    'og:title',
  )
  html = swap(
    html,
    /<meta property="og:description" content="[^"]*" \/>/,
    `<meta property="og:description" content="${description}" />`,
    'og:description',
  )
  html = swap(
    html,
    /<meta name="twitter:title" content="[^"]*" \/>/,
    `<meta name="twitter:title" content="${title}" />`,
    'twitter:title',
  )
  html = swap(
    html,
    /<meta name="twitter:description" content="[^"]*" \/>/,
    `<meta name="twitter:description" content="${description}" />`,
    'twitter:description',
  )
  return html
}

/** Every tag the emitter is responsible for, as (label, expected value). */
function expectedTags(route: PublicRoute): Array<[string, string]> {
  const url = ORIGIN + route.path
  return [
    ['<title>', route.title],
    ['meta description', route.description],
    ['canonical', url],
    ['og:url', url],
    ['og:title', route.title],
    ['og:description', route.description],
    ['twitter:title', route.title],
    ['twitter:description', route.description],
  ]
}

export function emitPublicPages(distDir: string = DIST): string[] {
  const templatePath = join(distDir, 'index.html')
  if (!existsSync(templatePath)) {
    throw new Error(`build-public-pages: ${templatePath} not found — run \`vite build\` first.`)
  }
  const template = readFileSync(templatePath, 'utf-8')

  const written: string[] = []
  for (const route of PUBLIC_ROUTES) {
    const html = buildPage(template, route)

    // Verify every tag actually landed, against the document WITH COMMENTS
    // STRIPPED. Checking the raw document is what let the first version of this
    // script pass while emitting the homepage's title — see outsideComments().
    const live = html.replace(COMMENT, '')
    for (const [label, value] of expectedTags(route)) {
      if (!live.includes(escapeAttr(value))) {
        throw new Error(`build-public-pages: ${route.path} is missing ${label} after the swap.`)
      }
    }
    if (live.includes('application/ld+json')) {
      throw new Error(
        `build-public-pages: ${route.path} still carries the homepage's Course/Offer schema.`,
      )
    }
    if (live.includes(`href="${ORIGIN}/"`)) {
      throw new Error(
        `build-public-pages: ${route.path} still carries the homepage canonical — ` +
          `the swap did not take.`,
      )
    }

    const dir = join(distDir, route.path.replace(/^\//, ''))
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'index.html'), html, 'utf-8')
    written.push(`${route.path}/index.html`)
  }
  return written
}

// Only run when invoked directly, so the emitter can be unit-tested.
if (import.meta.main) {
  const written = emitPublicPages()
  console.log(`✓ Emitted ${written.length} public pages with their own head:`)
  for (const w of written) console.log(`    dist${w}`)
}
