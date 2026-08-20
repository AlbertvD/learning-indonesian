// Unit test for build-public-pages.ts — the per-route head emitter.
//
// Lives in scripts/__tests__/ rather than src/__tests__/ deliberately: it tests
// a build script, and importing that script from a test under src/ pulls it into
// tsconfig.app.json's project, which carries `types: ["vite/client"]` and no node
// types — so `import { readFileSync } from 'node:fs'` fails to typecheck. The
// vitest config already discovers scripts/__tests__/**/*.test.ts (vite.config.ts:82).
//
// Exists because the first version of that script shipped the wrong output and
// its own self-check passed anyway. index.html's head contains a provenance
// comment with the literal text `<title>Kamoe Bisa</title>` ABOVE the real tag,
// so a naive `.replace(/<title>...<\/title>/)` rewrote the COMMENT and left the
// real title alone — while `html.includes(expectedTitle)` still returned true,
// because the expected string was now sitting in that comment.
//
// So the fixture below deliberately reproduces that shape: a comment containing
// tags that look exactly like the ones being swapped. A regression here means
// every public page silently ships the homepage's head to the link unfurlers
// this whole change exists to serve.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { emitPublicPages } from '../build-public-pages'
import { PUBLIC_ROUTES } from '../../src/pages/publicRoutes'

const ORIGIN = 'https://kamoebisa.nl'

// Mirrors the real index.html head: a comment quoting the tags, then the tags.
const FIXTURE = `<!doctype html>
<html lang="nl">
  <head>
    <meta charset="UTF-8" />
    <!-- Until 2026-08-05 the page carried only <title>Kamoe Bisa</title>, and no
         <meta name="description" content="OLD DESCRIPTION IN A COMMENT" />
         so a shared link rendered bare. -->
    <title>Kamoe Bisa — Indonesisch leren voor Nederlandstaligen</title>
    <meta name="description" content="HOMEPAGE DESCRIPTION" />
    <link rel="canonical" href="${ORIGIN}/" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${ORIGIN}/" />
    <meta property="og:title" content="Kamoe Bisa — Indonesisch leren voor Nederlandstaligen" />
    <meta property="og:description" content="HOMEPAGE DESCRIPTION" />
    <meta property="og:image" content="${ORIGIN}/og-image.jpg" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Kamoe Bisa — Indonesisch leren voor Nederlandstaligen" />
    <meta name="twitter:description" content="HOMEPAGE DESCRIPTION" />
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Course",
      "name": "Indonesisch leren voor Nederlandstaligen",
      "url": "${ORIGIN}/",
      "offers": { "@type": "Offer", "price": "9.00" }
    }
    </script>
  </head>
  <body><div id="root"></div></body>
</html>
`

/** The document as a browser sees it — comments carry no meaning. */
function live(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, '')
}

let dist: string

beforeAll(() => {
  dist = mkdtempSync(join(tmpdir(), 'public-pages-'))
  writeFileSync(join(dist, 'index.html'), FIXTURE, 'utf-8')
  emitPublicPages(dist)
})

afterAll(() => rmSync(dist, { recursive: true, force: true }))

describe('build-public-pages emitter', () => {
  it('emits one directory-index file per public route', () => {
    expect(PUBLIC_ROUTES.length).toBeGreaterThan(0)
    for (const route of PUBLIC_ROUTES) {
      const path = join(dist, route.path.replace(/^\//, ''), 'index.html')
      expect(() => readFileSync(path, 'utf-8')).not.toThrow()
    }
  })

  it.each(PUBLIC_ROUTES)('gives $path its own head, outside comments', route => {
    const html = readFileSync(join(dist, route.path.replace(/^\//, ''), 'index.html'), 'utf-8')
    const body = live(html)
    const url = ORIGIN + route.path

    // The regression: these must be true of the REAL tags, not of text that
    // happens to sit inside a comment.
    expect(body).toContain(`<title>${route.title}</title>`)
    expect(body).toContain(`<link rel="canonical" href="${url}" />`)
    expect(body).toContain(`<meta property="og:url" content="${url}" />`)
    expect(body).toContain(`<meta property="og:title" content="${route.title}" />`)
    expect(body).toContain(`<meta name="twitter:title" content="${route.title}" />`)
    expect(body).toContain(`<meta name="description" content="${route.description}" />`)
    expect(body).toContain(`<meta property="og:description" content="${route.description}" />`)
    expect(body).toContain(`<meta name="twitter:description" content="${route.description}" />`)
  })

  it.each(PUBLIC_ROUTES)('leaves no trace of the homepage head on $path', route => {
    const body = live(readFileSync(join(dist, route.path.replace(/^\//, ''), 'index.html'), 'utf-8'))
    expect(body).not.toContain(`href="${ORIGIN}/"`)
    expect(body).not.toContain('HOMEPAGE DESCRIPTION')
    expect(body).not.toContain('<title>Kamoe Bisa — Indonesisch leren voor Nederlandstaligen</title>')
    expect(route.path).not.toBe('/')
  })

  it.each(PUBLIC_ROUTES)('strips the homepage Course/Offer schema from $path', route => {
    // Copying the head wholesale left /privacy, /voorwaarden and /restitutie each
    // declaring themselves a Course with a subscription price, and every sibling
    // asserting a `url` that contradicted its own canonical. Observed live
    // 2026-08-19. Structured data about the product belongs on the page that
    // sells it; a sibling page must never inherit it by accident.
    const html = readFileSync(join(dist, route.path.replace(/^\//, ''), 'index.html'), 'utf-8')
    expect(html).not.toContain('application/ld+json')
    expect(html).not.toContain('"@type": "Course"')
    expect(html).not.toContain('"price": "9.00"')
  })

  it('keeps the schema on the homepage it describes', () => {
    expect(readFileSync(join(dist, 'index.html'), 'utf-8')).toContain('application/ld+json')
  })

  it('preserves the comments rather than stripping them', () => {
    // Masking is a transform, not a deletion — the provenance notes must survive.
    const html = readFileSync(join(dist, 'leenwoorden', 'index.html'), 'utf-8')
    expect(html).toContain('Until 2026-08-05 the page carried only')
    expect(html).toContain('so a shared link rendered bare.')
  })

  it('leaves everything outside the swapped tags untouched', () => {
    const html = readFileSync(join(dist, 'privacy', 'index.html'), 'utf-8')
    expect(html).toContain('<meta charset="UTF-8" />')
    expect(html).toContain('<meta property="og:type" content="website" />')
    expect(html).toContain(`<meta property="og:image" content="${ORIGIN}/og-image.jpg" />`)
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />')
    expect(html).toContain('<div id="root"></div>')
  })

  it('does not emit a / entry — the homepage head lives only in index.html', () => {
    expect(PUBLIC_ROUTES.some(r => r.path === '/')).toBe(false)
    // index.html itself must come back byte-identical.
    expect(readFileSync(join(dist, 'index.html'), 'utf-8')).toBe(FIXTURE)
  })

  it('fails loudly if the head template changes shape', () => {
    const broken = mkdtempSync(join(tmpdir(), 'public-pages-broken-'))
    mkdirSync(broken, { recursive: true })
    writeFileSync(join(broken, 'index.html'), '<html><head></head><body></body></html>', 'utf-8')
    // A silent pass here is the failure mode that matters: it would ship the
    // homepage's head everywhere while the build stayed green.
    // Matches the script's error prefix rather than one specific message: the
    // strip runs before the swaps, so which check fires first depends on how the
    // template is malformed. What matters is that it throws instead of emitting.
    expect(() => emitPublicPages(broken)).toThrow(/^build-public-pages:/)
    rmSync(broken, { recursive: true, force: true })
  })
})
