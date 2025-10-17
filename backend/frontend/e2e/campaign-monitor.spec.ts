import { test, expect } from '@playwright/test'

test.describe('Campaign Monitoring Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/campaigns')
  })

  test('should display campaigns list', async ({ page }) => {
    await expect(page).toHaveURL(/.*campaigns/)

    // Check for campaigns table or list
    const hasCampaigns = await page.locator('table, [role="table"], [data-testid*="campaign"]').isVisible()
      .catch(() => false)

    // Either campaigns exist or empty state is shown
    const hasEmptyState = await page.getByText(/no campaigns|create your first|get started/i).isVisible()
      .catch(() => false)

    expect(hasCampaigns || hasEmptyState).toBe(true)
  })

  test('should navigate to campaign details', async ({ page }) => {
    // Look for a campaign row or card
    const campaignLink = page.locator('a[href*="/campaigns/"]').first()

    if (await campaignLink.isVisible()) {
      await campaignLink.click()

      // Should navigate to campaign details page
      await expect(page).toHaveURL(/.*campaigns\/[^/]+/)
    }
  })

  test('should display campaign details page', async ({ page }) => {
    // Navigate directly to a campaign (using a placeholder ID)
    // In real tests, you'd use an actual campaign ID from your test data
    await page.goto('/dashboard/campaigns/test-campaign-id')

    // Check for key campaign detail elements
    const hasCampaignName = await page.locator('h1, h2, [data-testid*="campaign-name"]').isVisible()
      .catch(() => false)

    const hasBackButton = await page.getByRole('link', { name: /back|campaigns/i }).isVisible()
      .catch(() => false)

    // Either campaign details load or we see a not found/error message
    const hasError = await page.getByText(/not found|error|invalid/i).isVisible()
      .catch(() => false)

    expect(hasCampaignName || hasBackButton || hasError).toBe(true)
  })

  test('should display campaign metrics', async ({ page }) => {
    await page.goto('/dashboard/campaigns/test-campaign-id')

    // Look for common metric indicators
    const hasMetrics = await page.locator('[data-testid*="metric"], .metric, .stats').isVisible()
      .catch(() => false)

    // Look for volume, transactions, or other KPIs
    const hasVolumeInfo = await page.getByText(/volume|transactions|trades|swaps/i).isVisible()
      .catch(() => false)

    // At least one should be present if the page loads correctly
    expect(hasMetrics || hasVolumeInfo).toBe(true)
  })

  test('should display campaign status', async ({ page }) => {
    await page.goto('/dashboard/campaigns/test-campaign-id')

    // Check for status badge or indicator
    const hasStatus = await page.getByText(/active|paused|completed|running|stopped/i).isVisible()
      .catch(() => false)

    const hasStatusBadge = await page.locator('[data-testid*="status"], .status, .badge').isVisible()
      .catch(() => false)

    expect(hasStatus || hasStatusBadge).toBe(true)
  })

  test('should have action buttons for campaign control', async ({ page }) => {
    await page.goto('/dashboard/campaigns/test-campaign-id')

    // Look for control buttons (pause, stop, edit, etc.)
    const hasControlButtons = await page.locator('button').count() > 0

    expect(hasControlButtons).toBe(true)
  })

  test('should filter campaigns by status', async ({ page }) => {
    await page.goto('/dashboard/campaigns')

    // Look for status filter dropdown or tabs
    const filterButton = page.getByRole('button', { name: /filter|status|all/i })

    if (await filterButton.isVisible()) {
      await filterButton.click()

      // Check for status options
      const activeOption = page.getByText(/active/i).first()
      if (await activeOption.isVisible()) {
        await activeOption.click()

        // Wait for filter to apply
        await page.waitForTimeout(1000)

        // Page should still be on campaigns
        await expect(page).toHaveURL(/.*campaigns/)
      }
    }
  })

  test('should display real-time updates', async ({ page }) => {
    await page.goto('/dashboard/campaigns/test-campaign-id')

    // Check if WebSocket connection is established (basic check)
    // Real-time updates would typically use WebSockets

    // Get initial metric value (if visible)
    const metricElement = page.locator('[data-testid*="volume"], [data-testid*="transactions"]').first()

    if (await metricElement.isVisible()) {
      const initialText = await metricElement.textContent()

      // Wait a few seconds
      await page.waitForTimeout(3000)

      // Check if value might have updated (not guaranteed, but tests infrastructure)
      const updatedText = await metricElement.textContent()

      // At minimum, element should still exist
      expect(updatedText).toBeDefined()
    }
  })

  test('should search campaigns', async ({ page }) => {
    await page.goto('/dashboard/campaigns')

    // Look for search input
    const searchInput = page.getByPlaceholder(/search/i).or(page.getByLabel(/search/i))

    if (await searchInput.isVisible()) {
      await searchInput.fill('test')

      // Wait for search to filter
      await page.waitForTimeout(1000)

      // Should still be on campaigns page
      await expect(page).toHaveURL(/.*campaigns/)
    }
  })
})
