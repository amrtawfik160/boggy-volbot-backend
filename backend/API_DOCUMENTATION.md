# API Documentation - Solana Volume Bot

Complete REST API documentation for the Solana Volume Bot platform.

## Base URL

```
http://localhost:3001
```

## Authentication

All protected endpoints require a Bearer token from Supabase Auth:

```
Authorization: Bearer <supabase-jwt-token>
```

## Endpoints

### Health Check

#### GET /health

Health check endpoint.

**Response:**

```json
{
    "status": "ok"
}
```

---

### User Profile

#### GET /v1/me

Get current user profile.

**Auth:** Required

**Response:**

```json
{
    "id": "uuid",
    "email": "user@example.com",
    "role": "user"
}
```

---

### Tokens

#### GET /v1/tokens

List all tokens.

**Response:**

```json
[
    {
        "id": "uuid",
        "mint": "TokenMintAddress",
        "symbol": "BONK",
        "decimals": 9,
        "metadata": {},
        "created_at": "2025-10-01T00:00:00Z",
        "updated_at": "2025-10-01T00:00:00Z"
    }
]
```

#### GET /v1/tokens/:id

Get a specific token.

**Response:**

```json
{
    "id": "uuid",
    "mint": "TokenMintAddress",
    "symbol": "BONK",
    "decimals": 9,
    "metadata": {},
    "created_at": "2025-10-01T00:00:00Z",
    "updated_at": "2025-10-01T00:00:00Z"
}
```

#### POST /v1/tokens

Create a new token.

**Auth:** Required

**Request:**

```json
{
    "mint": "TokenMintAddress",
    "symbol": "BONK",
    "decimals": 9,
    "metadata": {}
}
```

**Response:**

```json
{
    "id": "uuid",
    "mint": "TokenMintAddress",
    "symbol": "BONK",
    "decimals": 9,
    "metadata": {},
    "created_at": "2025-10-01T00:00:00Z",
    "updated_at": "2025-10-01T00:00:00Z"
}
```

#### GET /v1/tokens/:id/pools

Get pools for a token.

**Response:**

```json
[
    {
        "id": "uuid",
        "token_id": "uuid",
        "pool_address": "PoolAddress",
        "dex": "raydium",
        "metadata": {},
        "created_at": "2025-10-01T00:00:00Z",
        "updated_at": "2025-10-01T00:00:00Z"
    }
]
```

#### POST /v1/tokens/:id/pools

Add a pool for a token.

**Auth:** Required

**Request:**

```json
{
    "pool_address": "PoolAddress",
    "dex": "raydium",
    "metadata": {}
}
```

**Response:**

```json
{
    "id": "uuid",
    "token_id": "uuid",
    "pool_address": "PoolAddress",
    "dex": "raydium",
    "metadata": {},
    "created_at": "2025-10-01T00:00:00Z",
    "updated_at": "2025-10-01T00:00:00Z"
}
```

---

### Wallets

#### GET /v1/wallets

List user's wallets.

**Auth:** Required

**Response:**

```json
[
    {
        "id": "uuid",
        "user_id": "uuid",
        "address": "WalletAddress",
        "label": "My Trading Wallet",
        "is_active": true,
        "created_at": "2025-10-01T00:00:00Z",
        "updated_at": "2025-10-01T00:00:00Z"
    }
]
```

#### GET /v1/wallets/:id

Get a specific wallet.

**Auth:** Required

**Response:**

```json
{
    "id": "uuid",
    "user_id": "uuid",
    "address": "WalletAddress",
    "label": "My Trading Wallet",
    "is_active": true,
    "created_at": "2025-10-01T00:00:00Z",
    "updated_at": "2025-10-01T00:00:00Z"
}
```

#### POST /v1/wallets

Add a new wallet.

**Auth:** Required

**Request (with private key):**

```json
{
    "privateKey": "base58-encoded-private-key",
    "label": "My Trading Wallet"
}
```

**Request (read-only):**

```json
{
    "address": "WalletAddress",
    "label": "View-only Wallet"
}
```

**Response:**

```json
{
    "id": "uuid",
    "user_id": "uuid",
    "address": "WalletAddress",
    "label": "My Trading Wallet",
    "is_active": true,
    "created_at": "2025-10-01T00:00:00Z",
    "updated_at": "2025-10-01T00:00:00Z"
}
```

#### PATCH /v1/wallets/:id

Update a wallet.

**Auth:** Required

**Request:**

```json
{
    "label": "Updated Wallet Name",
    "is_active": false
}
```

**Response:**

```json
{
    "id": "uuid",
    "user_id": "uuid",
    "address": "WalletAddress",
    "label": "Updated Wallet Name",
    "is_active": false,
    "created_at": "2025-10-01T00:00:00Z",
    "updated_at": "2025-10-01T00:00:00Z"
}
```

#### DELETE /v1/wallets/:id

Delete a wallet.

**Auth:** Required

**Response:** 204 No Content

---

### Campaigns

#### GET /v1/campaigns

List user's campaigns.

**Auth:** Required

**Response:**

```json
[
    {
        "id": "uuid",
        "user_id": "uuid",
        "name": "BONK Volume Campaign",
        "token_id": "uuid",
        "pool_id": "uuid",
        "params": {
            "slippage": 1,
            "minTxSize": 0.01,
            "maxTxSize": 0.1,
            "targetVolume": 1000,
            "useJito": true,
            "jitoTip": 0.001
        },
        "status": "active",
        "created_at": "2025-10-01T00:00:00Z",
        "updated_at": "2025-10-01T00:00:00Z",
        "tokens": {
            "mint": "TokenMint",
            "symbol": "BONK",
            "decimals": 9
        },
        "pools": {
            "pool_address": "PoolAddress",
            "dex": "raydium"
        }
    }
]
```

#### GET /v1/campaigns/:id

Get a specific campaign.

**Auth:** Required

**Response:**

```json
{
    "id": "uuid",
    "user_id": "uuid",
    "name": "BONK Volume Campaign",
    "token_id": "uuid",
    "pool_id": "uuid",
    "params": {
        "slippage": 1,
        "minTxSize": 0.01,
        "maxTxSize": 0.1,
        "targetVolume": 1000,
        "useJito": true,
        "jitoTip": 0.001
    },
    "status": "active",
    "created_at": "2025-10-01T00:00:00Z",
    "updated_at": "2025-10-01T00:00:00Z",
    "tokens": {
        "mint": "TokenMint",
        "symbol": "BONK",
        "decimals": 9
    },
    "pools": {
        "pool_address": "PoolAddress",
        "dex": "raydium"
    }
}
```

#### POST /v1/campaigns

Create a new campaign.

**Auth:** Required

**Request:**

```json
{
    "name": "BONK Volume Campaign",
    "token_id": "uuid",
    "pool_id": "uuid",
    "params": {
        "slippage": 1,
        "minTxSize": 0.01,
        "maxTxSize": 0.1,
        "targetVolume": 1000,
        "schedule": "0 * * * *",
        "useJito": true,
        "jitoTip": 0.001
    }
}
```

**Response:**

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "name": "BONK Volume Campaign",
  "token_id": "uuid",
  "pool_id": "uuid",
  "params": {...},
  "status": "draft",
  "created_at": "2025-10-01T00:00:00Z",
  "updated_at": "2025-10-01T00:00:00Z"
}
```

#### PATCH /v1/campaigns/:id

Update a campaign.

**Auth:** Required

**Request:**

```json
{
    "name": "Updated Campaign Name",
    "params": {
        "slippage": 2
    }
}
```

**Response:**

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "name": "Updated Campaign Name",
  "token_id": "uuid",
  "pool_id": "uuid",
  "params": {...},
  "status": "draft",
  "created_at": "2025-10-01T00:00:00Z",
  "updated_at": "2025-10-01T00:00:00Z"
}
```

#### POST /v1/campaigns/:id/start

Start a campaign.

**Auth:** Required

**Response:**

```json
{
  "campaign": {
    "id": "uuid",
    "status": "active",
    ...
  },
  "run": {
    "id": "uuid",
    "campaign_id": "uuid",
    "started_at": "2025-10-01T00:00:00Z",
    "status": "running"
  }
}
```

#### POST /v1/campaigns/:id/distribute

Trigger SOL distribution to generated wallets and enqueue initial trades.

Auth: Required

Request:

```json
{}
```

Response:

```json
{ "status": "queued" }
```

#### POST /v1/campaigns/:id/sell-only

Start sell-only mode for all active wallets (single sell pass, no loop).

Auth: Required

Response:

```json
{ "status": "queued", "run": { "id": "uuid", "status": "running" } }
```

#### POST /v1/campaigns/:id/gather-funds

Consolidate SOL from all active wallets back to the main wallet.

Auth: Required

Response:

```json
{ "status": "queued" }
```

#### POST /v1/campaigns/:id/pause

Pause a campaign.

**Auth:** Required

**Response:**

```json
{
    "status": "paused"
}
```

#### POST /v1/campaigns/:id/stop

Stop a campaign.

**Auth:** Required

**Response:**

```json
{
    "status": "stopped"
}
```

#### GET /v1/campaigns/:id/runs

Get campaign runs.

**Auth:** Required

**Response:**

```json
[
    {
        "id": "uuid",
        "campaign_id": "uuid",
        "started_at": "2025-10-01T00:00:00Z",
        "ended_at": null,
        "status": "running",
        "summary": {
            "total": 100,
            "succeeded": 95,
            "failed": 5,
            "pending": 0
        }
    }
]
```

#### GET /v1/campaigns/:id/status

Get campaign status with queue metrics.

**Auth:** Required

**Response:**

```json
{
  "campaign": {
    "id": "uuid",
    "name": "BONK Volume Campaign",
    "status": "active",
    ...
  },
  "latestRun": {
    "id": "uuid",
    "status": "running",
    "summary": {...}
  },
  "queueStats": {
    "gather": { "waiting": 0, "active": 1 },
    "buy": { "waiting": 10, "active": 5 },
    "sell": { "waiting": 8, "active": 3 }
  }
}
```

---

## Error Responses

### 400 Bad Request

```json
{
    "statusCode": 400,
    "message": "Validation failed",
    "error": "Bad Request"
}
```

### 401 Unauthorized

```json
{
    "statusCode": 401,
    "message": "Unauthorized"
}
```

### 404 Not Found

```json
{
    "statusCode": 404,
    "message": "Campaign not found",
    "error": "Not Found"
}
```

### 500 Internal Server Error

```json
{
    "statusCode": 500,
    "message": "Internal server error"
}
```

---

## Rate Limiting

-   **Limit:** 100 requests per minute per user
-   **Headers:**
    -   `X-RateLimit-Limit: 100`
    -   `X-RateLimit-Remaining: 95`
    -   `X-RateLimit-Reset: 1633024800`

---

## WebSocket / Server-Sent Events (SSE)

### Coming Soon

Real-time campaign status updates via WebSocket or SSE.

```
ws://localhost:3001/campaigns/:id/live
```

---

## Queue Jobs

The API enqueues jobs to BullMQ for asynchronous processing:

### Queue: `gather`

Fetch pool information and balances.

**Payload:**

```json
{
    "runId": "uuid",
    "campaignId": "uuid",
    "poolId": "PoolAddress"
}
```

### Queue: `trade.buy`

Execute buy transactions.

**Payload:**

```json
{
    "runId": "uuid",
    "walletId": "uuid",
    "mint": "TokenMint",
    "amount": 0.01,
    "poolId": "PoolAddress",
    "slippage": 1,
    "useJito": true
}
```

### Queue: `trade.sell`

Execute sell transactions.

**Payload:**

```json
{
    "runId": "uuid",
    "walletId": "uuid",
    "mint": "TokenMint",
    "amount": 0.01,
    "poolId": "PoolAddress",
    "slippage": 1,
    "useJito": true
}
```

### Queue: `distribute`

Distribute SOL to wallets.

**Payload:**

```json
{
    "runId": "uuid",
    "fromWalletId": "uuid",
    "toAddresses": ["Address1", "Address2"],
    "amount": 0.01
}
```

### Queue: `status`

Aggregate campaign metrics.

**Payload:**

```json
{
    "campaignRunId": "uuid"
}
```

### Queue: `webhook`

Deliver webhook notifications.

**Payload:**

```json
{
  "webhookId": "uuid",
  "event": "campaign.started",
  "payload": {...}
}
```

### Queue: `funds.gather`

Consolidate SOL from user wallets back to a main wallet.

**Payload:**

```json
{
    "campaignId": "uuid"
}
```

---

## Example Usage

### Create a campaign and start it

```bash
# 1. Login to get JWT token
curl -X POST https://your-supabase.supabase.co/auth/v1/token \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password"}'

# 2. Create a token
curl -X POST http://localhost:3001/v1/tokens \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "mint": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    "symbol": "BONK",
    "decimals": 5
  }'

# 3. Add a wallet
curl -X POST http://localhost:3001/v1/wallets \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "privateKey": "your-base58-private-key",
    "label": "Trading Wallet"
  }'

# 4. Create a campaign
curl -X POST http://localhost:3001/v1/campaigns \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "BONK Volume",
    "token_id": "uuid",
    "pool_id": "uuid",
    "params": {
      "slippage": 1,
      "targetVolume": 1000
    }
  }'

# 5. Start the campaign
curl -X POST http://localhost:3001/v1/campaigns/<campaign-id>/start \
  -H "Authorization: Bearer <token>"

# 6. Check status
curl http://localhost:3001/v1/campaigns/<campaign-id>/status \
  -H "Authorization: Bearer <token>"
```

---

## Security

-   All wallet private keys are encrypted at rest using AES-256-GCM
-   Master encryption key must be set in `MASTER_ENCRYPTION_KEY` environment variable
-   Supabase JWT tokens expire after 1 hour
-   Row Level Security (RLS) enforced at database level
