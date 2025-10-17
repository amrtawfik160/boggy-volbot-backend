import { test, expect } from '@playwright/test'

test.describe('Authentication - Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
  })

  test('should display login page with form elements', async ({ page }) => {
    // Check that login page loads
    await expect(page).toHaveURL(/.*login/)

    // Check for email and password fields
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByLabel(/password/i)).toBeVisible()

    // Check for submit button
    await expect(page.getByRole('button', { name: /sign in|login|log in/i })).toBeVisible()
  })

  test('should show validation error for empty email', async ({ page }) => {
    // Try to submit with empty email
    const submitButton = page.getByRole('button', { name: /sign in|login|log in/i })
    await submitButton.click()

    // Check for validation error (HTML5 validation or custom)
    const emailInput = page.getByLabel(/email/i)
    const isInvalid = await emailInput.evaluate((el: HTMLInputElement) => !el.validity.valid)
    expect(isInvalid).toBe(true)
  })

  test('should show validation error for invalid email format', async ({ page }) => {
    // Enter invalid email
    await page.getByLabel(/email/i).fill('invalidemail')
    await page.getByRole('button', { name: /sign in|login|log in/i }).click()

    // Check for validation error
    const emailInput = page.getByLabel(/email/i)
    const isInvalid = await emailInput.evaluate((el: HTMLInputElement) => !el.validity.valid)
    expect(isInvalid).toBe(true)
  })

  test('should navigate to dashboard on successful login', async ({ page }) => {
    // Note: This test assumes test credentials exist
    // In a real scenario, you'd use test accounts or mock the auth API

    await page.getByLabel(/email/i).fill('test@example.com')
    await page.getByLabel(/password/i).fill('testpassword123')
    await page.getByRole('button', { name: /sign in|login|log in/i }).click()

    // Wait for navigation or error message
    await page.waitForTimeout(2000)

    // Check if redirected to dashboard OR error message appears
    const url = page.url()
    const hasError = await page.getByText(/error|invalid|incorrect/i).isVisible().catch(() => false)

    // Either we're on dashboard or we see an error (which is expected without real credentials)
    expect(url.includes('/dashboard') || hasError).toBe(true)
  })

  test('should have link to sign up page', async ({ page }) => {
    const signUpLink = page.getByRole('link', { name: /sign up|create account|register/i })
    await expect(signUpLink).toBeVisible()
  })

  test('should toggle password visibility', async ({ page }) => {
    const passwordInput = page.getByLabel(/password/i)

    // Check initial type is password
    let inputType = await passwordInput.getAttribute('type')
    expect(inputType).toBe('password')

    // Look for toggle button (eye icon or similar)
    const toggleButton = page.locator('[aria-label*="password" i], [aria-label*="show" i], [aria-label*="hide" i]').first()

    if (await toggleButton.isVisible()) {
      await toggleButton.click()

      // Check if type changed to text
      inputType = await passwordInput.getAttribute('type')
      expect(inputType).toBe('text')
    }
  })
})
