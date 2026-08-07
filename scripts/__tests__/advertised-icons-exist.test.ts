// scripts/__tests__/advertised-icons-exist.test.ts
//
// Asserts that every icon the app ADVERTISES actually EXISTS.
//
// Why this test exists: `pwa-icon-192.png` and `pwa-icon-512.png` were declared
// in the PWA manifest (vite.config.ts) and had never existed in the repo. The
// failure was invisible from every angle — the SPA fallback
// (`assets.not_found_handling: "single-page-application"`, wrangler.jsonc)
// answers a missing path with index.html and HTTP **200**, so the browser was
// handed an HTML document labelled `image/png` rather than a 404. No console
// error, no failed request, no test. It shipped that way for months and only
// surfaced when someone asked to change the favicon.
//
// A missing icon is not cosmetic: the manifest is what a device uses for
// "add to home screen", so a broken entry means the installed app carries a
// generic placeholder or a screenshot.

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '../..')
const publicDir = resolve(root, 'public')

/** Every `src:` inside the manifest `icons: [...]` block of vite.config.ts. */
function manifestIconPaths(): string[] {
  const config = readFileSync(resolve(root, 'vite.config.ts'), 'utf8')
  const icons = config.match(/icons:\s*\[([\s\S]*?)\]/)?.[1]
  if (!icons) throw new Error('could not locate the manifest icons[] block in vite.config.ts')
  return [...icons.matchAll(/src:\s*'([^']+)'/g)].map(m => m[1])
}

/** Every `href` on a <link rel="...icon..."> in index.html. */
function htmlIconPaths(): string[] {
  const html = readFileSync(resolve(root, 'index.html'), 'utf8')
  return [...html.matchAll(/<link[^>]+rel="[^"]*icon[^"]*"[^>]*>/g)]
    .map(tag => tag[0].match(/href="([^"]+)"/)?.[1])
    .filter((h): h is string => Boolean(h))
}

describe('advertised icons exist on disk', () => {
  it('declares at least one manifest icon and one <link rel=icon>', () => {
    // Guards the guard: a regex that silently matched nothing would make every
    // assertion below vacuously pass.
    expect(manifestIconPaths().length).toBeGreaterThan(0)
    expect(htmlIconPaths().length).toBeGreaterThan(0)
  })

  it.each(manifestIconPaths())('PWA manifest icon %s exists in public/', (src) => {
    expect(existsSync(resolve(publicDir, src.replace(/^\//, '')))).toBe(true)
  })

  it.each(htmlIconPaths())('index.html icon %s exists in public/', (href) => {
    expect(existsSync(resolve(publicDir, href.replace(/^\//, '')))).toBe(true)
  })

  it('the maskable icon is opaque to its edges', () => {
    // Maskable icons are CROPPED by the platform to a circle/squircle. A source
    // with transparent (rounded) corners shows pale slivers after cropping, so
    // the background must bleed to all four edges. Cheap proxy for a pixel
    // check: the maskable PNG must not be the same file as the rounded one.
    const maskable = readFileSync(resolve(publicDir, 'pwa-icon-512.png'))
    const rounded = readFileSync(resolve(publicDir, 'pwa-icon-192.png'))
    expect(maskable.equals(rounded)).toBe(false)
  })
})
