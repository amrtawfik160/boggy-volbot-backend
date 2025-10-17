# Jito Configuration Guide

This guide explains how to configure Jito bundles for transaction execution in the Boggy Volume Bot.

## Overview

Jito is a MEV (Maximal Extractable Value) protection service that allows transactions to be bundled and executed with priority. The bot supports both legacy transaction execution (via RPC) and Jito bundle execution.

## Configuration Structure

Jito configuration is stored in the `user_settings.jito_config` JSONB field in the database. Each user can configure their own Jito settings.

### Configuration Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `useJito` | boolean | No | `false` | Enable/disable Jito bundle execution |
| `jitoKey` | string | Conditional* | - | Base58-encoded Jito authentication keypair (87-88 chars) |
| `blockEngineUrl` | string | No | `https://mainnet.block-engine.jito.wtf` | Jito block engine URL |
| `jitoFee` | number | No | `0.0001` | Tip amount in SOL (min: 0.00001, max: 1.0) |
| `bundleTransactionLimit` | number | No | `4` | Max transactions per bundle (min: 1, max: 5) |
| `bundleTimeoutMs` | number | No | `30000` | Bundle timeout in milliseconds (min: 5000, max: 60000) |

**Required when `useJito` is `true`*

## API Endpoints

### Get User Settings

```http
GET /api/v1/settings
Authorization: Bearer <token>
```

**Response:**
```json
{
  "user_id": "uuid",
  "trading_config": { ... },
  "sell_config": { ... },
  "jito_config": {
    "useJito": false,
    "blockEngineUrl": "https://mainnet.block-engine.jito.wtf",
    "jitoFee": 0.0001,
    "bundleTransactionLimit": 4,
    "bundleTimeoutMs": 30000
  }
}
```

### Update User Settings

```http
PATCH /api/v1/settings
Authorization: Bearer <token>
Content-Type: application/json

{
  "jito_config": {
    "useJito": true,
    "jitoKey": "5J8QN1GqvuYXhgmkCPKLqUKZPvYvqJ5YQqQBqN6X...",
    "jitoFee": 0.0002
  }
}
```

**Response:**
```json
{
  "user_id": "uuid",
  "jito_config": {
    "useJito": true,
    "jitoKey": "5J8QN1GqvuYXhgmkCPKLqUKZPvYvqJ5YQqQBqN6X...",
    "blockEngineUrl": "https://mainnet.block-engine.jito.wtf",
    "jitoFee": 0.0002,
    "bundleTransactionLimit": 4,
    "bundleTimeoutMs": 30000
  },
  ...
}
```

## Configuration Priority

The bot uses the following priority order when determining whether to use Jito:

1. **User Settings** (`user_settings.jito_config.useJito`)
2. **Campaign Params** (`campaign.params.useJito`)
3. **Default** (`false`)

This allows users to override campaign-level settings with their own preferences.

## Environment Variables

Alternative to storing configuration in the database, you can provide defaults via environment variables:

```bash
# Jito authentication key (base58-encoded keypair)
JITO_KEY=5J8QN1GqvuYXhgmkCPKLqUKZPvYvqJ5YQqQBqN6X...

# Block engine URL
BLOCKENGINE_URL=https://mainnet.block-engine.jito.wtf

# Tip amount in SOL
JITO_FEE=0.0001
```

**Note:** User settings in the database take precedence over environment variables.

## Validation Rules

### jitoKey Validation

- **Format:** Base58-encoded string
- **Length:** 87-88 characters
- **Invalid characters:** `0`, `O`, `I`, `l` (these are not valid in base58)
- **Example:** `5J8QN1GqvuYXhgmkCPKLqUKZPvYvqJ5YQqQBqN6X5J8QN1GqvuYXhgmkCPKLqUKZPvYvqJ5YQqQBqN6X`

### jitoFee Validation

- **Minimum:** 0.00001 SOL
- **Maximum:** 1.0 SOL
- **Recommended:** 0.0001 - 0.001 SOL

Higher fees increase the likelihood of bundle acceptance but cost more.

### bundleTransactionLimit Validation

- **Minimum:** 1 transaction
- **Maximum:** 5 transactions
- **Default:** 4 transactions

Jito has limits on bundle size. Keep this value at or below 5.

### bundleTimeoutMs Validation

- **Minimum:** 5000ms (5 seconds)
- **Maximum:** 60000ms (60 seconds)
- **Default:** 30000ms (30 seconds)

Longer timeouts give bundles more time to land but may delay error feedback.

## Usage Examples

### Example 1: Enable Jito with Defaults

```json
{
  "jito_config": {
    "useJito": true,
    "jitoKey": "5J8QN1GqvuYXhgmkCPKLqUKZPvYvqJ5YQqQBqN6X5J8QN1GqvuYXhgmkCPKLqUKZPvYvqJ5YQqQBqN6X"
  }
}
```

This will use Jito with all default values (0.0001 SOL tip, 4 tx limit, 30s timeout).

### Example 2: Enable Jito with Custom Fee

```json
{
  "jito_config": {
    "useJito": true,
    "jitoKey": "5J8QN1GqvuYXhgmkCPKLqUKZPvYvqJ5YQqQBqN6X5J8QN1GqvuYXhgmkCPKLqUKZPvYvqJ5YQqQBqN6X",
    "jitoFee": 0.0005
  }
}
```

### Example 3: Enable Jito with Custom Block Engine

```json
{
  "jito_config": {
    "useJito": true,
    "jitoKey": "5J8QN1GqvuYXhgmkCPKLqUKZPvYvqJ5YQqQBqN6X5J8QN1GqvuYXhgmkCPKLqUKZPvYvqJ5YQqQBqN6X",
    "blockEngineUrl": "https://custom.block-engine.example.com",
    "jitoFee": 0.0002,
    "bundleTransactionLimit": 3,
    "bundleTimeoutMs": 45000
  }
}
```

### Example 4: Disable Jito

```json
{
  "jito_config": {
    "useJito": false
  }
}
```

This will disable Jito and use legacy transaction execution via RPC.

## Error Handling

### Common Validation Errors

#### Missing jitoKey when useJito is true

```json
{
  "statusCode": 400,
  "message": "jitoKey is required when useJito is true",
  "error": "Bad Request"
}
```

**Solution:** Provide a valid base58-encoded jitoKey.

#### Invalid jitoKey format

```json
{
  "statusCode": 400,
  "message": [
    "jitoKey must be a valid base58 encoded private key (87-88 characters)"
  ],
  "error": "Bad Request"
}
```

**Solution:** Ensure the key is base58-encoded and 87-88 characters long.

#### Invalid jitoFee

```json
{
  "statusCode": 400,
  "message": [
    "jitoFee must be at least 0.00001 SOL",
    "jitoFee must not exceed 1 SOL"
  ],
  "error": "Bad Request"
}
```

**Solution:** Set jitoFee between 0.00001 and 1.0 SOL.

#### Invalid blockEngineUrl

```json
{
  "statusCode": 400,
  "message": [
    "blockEngineUrl must be a valid URL"
  ],
  "error": "Bad Request"
}
```

**Solution:** Provide a valid HTTP/HTTPS URL.

## Security Considerations

### Storing jitoKey

- **Do not commit** jitoKey to version control
- **Use environment variables** for development/testing
- **Store in database** only if properly encrypted at rest
- **Use service role key** for Supabase operations to ensure proper RLS

### Key Rotation

To rotate your Jito authentication key:

1. Generate a new keypair
2. Update your settings via the API with the new key
3. The new key will be used for all subsequent transactions

### Access Control

- User settings are protected by Row Level Security (RLS) in Supabase
- Users can only read/update their own settings
- Authentication is required for all settings endpoints

## Worker Integration

Workers automatically read Jito configuration when executing trades:

### TradeBuyWorker

1. Loads campaign details
2. Loads user settings (`user_settings.jito_config`)
3. Determines `useJito` based on priority (user settings > campaign params)
4. Builds `JitoExecutorConfig` if enabled
5. Creates `TradingService` with configuration
6. Executes buy transaction using selected executor

### TradeSellWorker

Similar flow to TradeBuyWorker, applying Jito configuration to sell transactions.

### Executor Selection

```typescript
// Pseudo-code showing executor selection logic
const useJito = userSettings.jito_config?.useJito ?? campaign.params?.useJito ?? false;

if (useJito) {
  const executor = new JitoExecutor({
    connection,
    rpcEndpoint,
    rpcWebsocketEndpoint,
    blockEngineUrl: userSettings.jito_config?.blockEngineUrl ?? env.BLOCKENGINE_URL,
    jitoAuthKeypair: Keypair.fromSecretKey(bs58.decode(jitoKey)),
    jitoTipAmount: userSettings.jito_config?.jitoFee ?? env.JITO_FEE,
    bundleTransactionLimit: 4,
    bundleTimeoutMs: 30000,
  });
} else {
  const executor = new LegacyExecutor({
    connection,
    rpcEndpoint,
    rpcWebsocketEndpoint,
  });
}
```

## Testing

### Unit Tests

Run validation tests:

```bash
npm test -- jito-config.validation.spec.ts
```

### Integration Tests

Run controller integration tests:

```bash
npm test -- settings-controller.integration.spec.ts
```

### Manual Testing

Use curl or Postman to test the API:

```bash
# Get current settings
curl -X GET https://api.example.com/api/v1/settings \
  -H "Authorization: Bearer YOUR_TOKEN"

# Update Jito config
curl -X PATCH https://api.example.com/api/v1/settings \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jito_config": {
      "useJito": true,
      "jitoKey": "YOUR_JITO_KEY",
      "jitoFee": 0.0002
    }
  }'
```

## Troubleshooting

### Bundle Not Landing

If bundles are consistently failing to land:

1. **Increase jitoFee** - Higher tips increase priority
2. **Reduce bundleTransactionLimit** - Smaller bundles may land faster
3. **Increase bundleTimeoutMs** - Give bundles more time
4. **Check blockEngineUrl** - Ensure it's reachable and correct

### Invalid Key Errors

If you see "Invalid jitoKey" errors:

1. Verify the key is base58-encoded
2. Check the key length (should be 87-88 characters)
3. Ensure no invalid characters (`0`, `O`, `I`, `l`)
4. Test key with `bs58.decode()` to verify it's valid

### Configuration Not Applied

If changes aren't taking effect:

1. Verify settings were saved in database
2. Check worker logs for configuration loading
3. Ensure user_id matches between settings and campaign
4. Restart workers to reload configuration

## Additional Resources

- [Jito Documentation](https://jito.wtf/docs)
- [Jito Block Engine API](https://jito-labs.gitbook.io/mev/searcher-services/block-engine)
- [Base58 Encoding](https://en.wikipedia.org/wiki/Base58)
