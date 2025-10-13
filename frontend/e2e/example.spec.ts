import { test, expect } from '@playwright/test'

test('basic navigation', async ({ page }) => {
  await page.goto('/')

  // Check that the page loads
  await expect(page).toHaveURL('/')

  // Check for presence of navigation or main content
  const body = await page.locator('body')
  await expect(body).toBeVisible()
})
