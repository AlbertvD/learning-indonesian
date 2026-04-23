import { test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

// Visual capture of /admin/design-lab at multiple viewports × themes.
// Not a regression test — designed to produce artifacts for human review.
// Output lands in test-results/design-lab/ (gitignored).

const OUT_DIR = join(process.cwd(), 'test-results', 'design-lab')
mkdirSync(OUT_DIR, { recursive: true })

const VIEWPORTS = [
  { name: '320', width: 320, height: 900 },
  { name: '390', width: 390, height: 900 },
  { name: '430', width: 430, height: 900 },
  { name: '768', width: 768, height: 1100 },
  { name: '1024', width: 1024, height: 1300 },
] as const

const THEMES = ['dark', 'light'] as const

async function setTheme(page: Page, theme: 'dark' | 'light') {
  await page.addInitScript((t) => {
    window.localStorage.setItem('indonesian-color-scheme', t)
  }, theme)
}

for (const theme of THEMES) {
  for (const viewport of VIEWPORTS) {
    test(`capture /admin/design-lab @ ${theme} / ${viewport.name}px`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await setTheme(page, theme)
      await page.goto('/admin/design-lab?bypassAuth=1', { waitUntil: 'networkidle' })
      // Give animations a beat to settle
      await page.waitForTimeout(500)
      await page.screenshot({
        path: join(OUT_DIR, `design-lab-${theme}-${viewport.name}.png`),
        fullPage: true,
      })
    })
  }
}
