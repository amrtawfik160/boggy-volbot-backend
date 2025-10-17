# Testing Guide

This document provides an overview of the testing infrastructure for the Solana Volume Bot frontend application.

## Test Stack

### Component Testing
- **Framework**: Vitest
- **Testing Library**: React Testing Library
- **Environment**: jsdom
- **Coverage**: v8

### E2E Testing
- **Framework**: Playwright
- **Browsers**: Chromium, Firefox, WebKit
- **Mobile**: Pixel 5, iPhone 12

## Running Tests

### Component Tests

```bash
# Run all component tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### E2E Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run E2E tests with UI mode
npm run test:e2e:ui

# Debug E2E tests
npm run test:e2e:debug

# View E2E test report
npm run test:e2e:report
```

## Test Structure

### Component Tests
Located in: `components/**/*.test.tsx`, `hooks/**/*.test.ts`

Current coverage includes:
- Dashboard components (metric-card, empty-state, data-table, loading-spinner, status-badge)
- Admin components (StatusIndicator, AbuseAlertCard, AdminHeader)

Total: 118 tests across 9 test files

### E2E Tests
Located in: `e2e/**/*.spec.ts`

Current coverage includes:
- Authentication flow (login, validation, navigation)
- Campaign creation (form validation, submission)
- Campaign monitoring (list, details, metrics, real-time updates)

Total: 23 tests across 3 critical flows

## Configuration Files

- `vitest.config.ts` - Vitest configuration for component tests
- `vitest.setup.ts` - Test setup and global mocks
- `playwright.config.ts` - Playwright configuration for E2E tests

## Coverage Reports

Coverage reports are generated in the `coverage/` directory with the following formats:
- Text summary (console output)
- HTML report (`coverage/index.html`)
- JSON format (`coverage/coverage-final.json`)
- LCOV format (`coverage/lcov.info`)

## Mocked Dependencies

The test setup includes mocks for:
- Next.js router (`next/navigation`)
- Supabase client (`@/lib/supabase/client`)
- Socket.io client (`socket.io-client`)
- window.matchMedia (for responsive testing)
- next-themes (for theme testing)

## Writing Tests

### Component Test Example

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import MyComponent from './MyComponent'

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })
})
```

### E2E Test Example

```typescript
import { test, expect } from '@playwright/test'

test.describe('Feature Flow', () => {
  test('performs user action', async ({ page }) => {
    await page.goto('/path')
    await page.getByRole('button', { name: /submit/i }).click()
    await expect(page).toHaveURL(/.*success/)
  })
})
```

## CI/CD Integration

Tests are configured to run in CI environments with:
- Retry logic for flaky tests
- Parallel execution
- Screenshot/trace capture on failures
- Coverage thresholds

## Troubleshooting

### Common Issues

1. **Tests timing out**: Increase timeout in configuration
2. **Flaky E2E tests**: Use proper wait conditions, avoid arbitrary waits
3. **Coverage not generating**: Ensure all tests pass or use `--coverage.all` flag
4. **Mock errors**: Check mock setup in `vitest.setup.ts`

## Best Practices

1. **Component Tests**
   - Test user behavior, not implementation
   - Use semantic queries (getByRole, getByLabelText)
   - Mock external dependencies
   - Keep tests focused and isolated

2. **E2E Tests**
   - Test critical user flows
   - Use page object model for complex flows
   - Include error scenarios
   - Test responsive behavior

3. **Coverage**
   - Aim for >80% coverage on critical paths
   - Don't obsess over 100% coverage
   - Focus on meaningful tests over coverage metrics
