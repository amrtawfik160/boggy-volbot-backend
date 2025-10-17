# Sentry Error Tracking Integration

Sentry v7+ has been integrated for comprehensive error tracking and performance monitoring across both API and Workers.

## Configuration

### Environment Variables

Add the following to your `.env` file:

```bash
# Sentry Configuration
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
SENTRY_ENVIRONMENT=development  # or staging, production
SENTRY_TRACES_SAMPLE_RATE=0.1   # 0.0 to 1.0 (10% of transactions)
```

### Getting Your Sentry DSN

1. Sign up at [sentry.io](https://sentry.io)
2. Create a new project (choose Node.js)
3. Copy the DSN from: Settings → Projects → [Your Project] → Client Keys (DSN)

## Features

### Automatic Error Tracking

- **API**: All uncaught exceptions and 5xx errors are automatically captured
- **Workers**: All worker job failures and errors are automatically captured
- **Context**: Request data, user info, and breadcrumbs are included

### Manual Error Tracking

```typescript
// In API controllers or services
constructor(private readonly sentryService: SentryService) {}

// Capture an exception
this.sentryService.captureException(error, {
  custom_context: { key: 'value' }
});

// Capture a message
this.sentryService.captureMessage('Something happened', 'info');
```

### User Context

```typescript
// Set user context (automatically cleared on request end)
this.sentryService.setUser({
  id: user.id,
  email: user.email,
  username: user.username,
});
```

### Breadcrumbs

```typescript
// Add breadcrumbs for better error context
this.sentryService.addBreadcrumb({
  type: 'http',
  category: 'request',
  message: 'API call to external service',
  level: 'info',
  data: { endpoint: '/api/tokens', status: 200 },
});
```

### Performance Monitoring

```typescript
// Track performance transactions
const transaction = this.sentryService.startTransaction({
  op: 'http.server',
  name: 'GET /api/campaigns',
});

try {
  // Your code here
  const span = transaction?.startChild({
    op: 'database',
    description: 'Fetch campaigns',
  });
  // ... database query
  span?.finish();

  transaction?.setStatus('ok');
} catch (error) {
  transaction?.setStatus('internal_error');
  throw error;
} finally {
  transaction?.finish();
}
```

## Testing

### API Test Endpoints (Development Only)

When `NODE_ENV !== 'production'`, test endpoints are available:

- `GET /v1/sentry-test/test-message` - Test message capture
- `GET /v1/sentry-test/test-error-400` - Test 4xx error (NOT sent to Sentry)
- `GET /v1/sentry-test/test-error-500` - Test 5xx error (sent to Sentry)
- `GET /v1/sentry-test/test-uncaught` - Test uncaught exception
- `POST /v1/sentry-test/test-context` - Test error with context
- `GET /v1/sentry-test/test-transaction` - Test performance transaction

### Manual Testing

Run the test script:

```bash
cd backend/api
npx ts-node src/sentry/test-sentry.ts
```

This will send test events to Sentry and you can verify them in your dashboard.

## Error Filtering

The integration automatically filters out:

- **4xx errors**: Client errors are not sent to Sentry (they're user errors, not bugs)
- **5xx errors**: Server errors ARE sent to Sentry
- **Rate limit errors**: 429 errors are filtered out
- **Sensitive data**: Headers and body fields containing passwords, keys, tokens are redacted

## Architecture

### API

```
main.ts
  ↓ Initialize Sentry early
SentryModule (Global)
  ↓ Provides
SentryService + SentryInterceptor
  ↓ Automatically captures
All HTTP errors (5xx) + Uncaught exceptions
```

### Workers

```
main.ts
  ↓ Initialize SentryService
Worker Event Listeners
  ↓ On 'failed' or 'error'
SentryService.captureException()
  ↓ Sends to Sentry with context
```

## Best Practices

1. **Don't over-report**: Only send actual errors, not expected validation failures
2. **Add context**: Always include relevant context when manually capturing errors
3. **Set user info**: Set user context when available for better debugging
4. **Use breadcrumbs**: Add breadcrumbs for key operations to understand error flow
5. **Tag appropriately**: Use tags for filtering (e.g., `worker_name`, `campaign_id`)
6. **Monitor performance**: Use transactions for slow endpoint detection

## Production Considerations

1. **Sample rate**: Adjust `SENTRY_TRACES_SAMPLE_RATE` based on traffic (0.01 = 1%)
2. **Remove test endpoints**: Test controller is automatically disabled in production
3. **Set environment**: Always set `SENTRY_ENVIRONMENT` to distinguish dev/staging/prod
4. **Budget**: Monitor Sentry quota usage, adjust sample rates if needed

## Troubleshooting

### Events not appearing in Sentry

1. Check `SENTRY_DSN` is set correctly
2. Verify internet connectivity (Sentry is a cloud service)
3. Check console for "Sentry initialized" message
4. Try the test script to verify configuration

### Too many events

1. Lower `SENTRY_TRACES_SAMPLE_RATE` for performance monitoring
2. Add custom filters in `beforeSend` hook (see `sentry.service.ts`)
3. Use Sentry's Inbound Filters in dashboard settings

## Resources

- [Sentry Node.js Docs](https://docs.sentry.io/platforms/node/)
- [Sentry Performance Monitoring](https://docs.sentry.io/product/performance/)
- [Sentry Best Practices](https://docs.sentry.io/product/best-practices/)
