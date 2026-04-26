import { test, expect } from '@playwright/test'

test.describe('lesson reader v2', () => {
  test.skip('requires an authenticated local app with VITE_LESSON_READER_V2=true')

  test('desktop and mobile reader avoid horizontal overflow', async ({ page }) => {
    await page.goto('/lesson/lesson-id-1')
    await expect(page.getByLabel('Lesson companion')).toBeVisible()

    const desktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(desktopOverflow).toBe(false)

    await page.setViewportSize({ width: 390, height: 844 })
    const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(mobileOverflow).toBe(false)
  })
})
