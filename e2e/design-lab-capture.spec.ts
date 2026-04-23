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

// Focused per-section captures at mobile (390px) in both themes — easier to
// review individual primitives than scrolling a 9000px full-page image.
const FOCUSED_SECTIONS = [
  'Tokens',
  'ExerciseInstruction',
  'ExercisePromptCard — 5 variants',
  'ExerciseOption — 6 states × 2 variants',
  'ExerciseOptionGroup',
  'ExerciseTextInput — 5 states',
  'ExerciseSubmitButton',
  'LanguagePill',
  'ExerciseHint',
  'ExerciseAudioButton',
  'ExerciseFeedback',
  'FlagButton (admin)',
] as const

for (const theme of THEMES) {
  for (const sectionName of FOCUSED_SECTIONS) {
    const slug = sectionName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    test(`capture section "${sectionName}" @ ${theme} / 390px`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 900 })
      await setTheme(page, theme)
      await page.goto('/admin/design-lab?bypassAuth=1', { waitUntil: 'networkidle' })
      await page.waitForTimeout(500)
      const heading = page.getByRole('heading', { name: sectionName, level: 2 })
      await heading.scrollIntoViewIfNeeded()
      await page.waitForTimeout(200)
      // Capture the heading + its content by screenshotting a viewport-height
      // region starting at the heading's top.
      await page.screenshot({
        path: join(OUT_DIR, `section-${theme}-390-${slug}.png`),
        clip: await heading.boundingBox().then(bb => bb
          ? { x: 0, y: Math.max(0, bb.y - 20), width: 390, height: Math.min(900, 900) }
          : { x: 0, y: 0, width: 390, height: 900 }),
      })
    })
  }
}
