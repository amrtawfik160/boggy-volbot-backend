# Solana Volume Bot - Workers

BullMQ workers for processing volume generation jobs on Solana.

## Prerequisites

- Node.js >= 20.x
- npm or pnpm
- Redis >= 7.x
- Solana RPC endpoint(s)

## Installation

```bash
npm install
# or
pnpm install
```

## Environment Setup

Create a `.env` file in the `backend` directory (see `backend/env.example`):

```env
# Redis
REDIS_URL=redis://localhost:6379

# Solana
SOLANA_RPC_PRIMARY=https://api.mainnet-beta.solana.com
SOLANA_RPC_FALLBACK=https://api.mainnet-beta.solana.com

# Jito
JITO_KEYPAIR_JSON=...
JITO_TIP_AMOUNT=0.001

# Worker Configuration
WORKER_CONCURRENCY=10
```

## Development

```bash
# Start Redis
docker run -d -p 6379:6379 redis:7-alpine

# Start workers
npm run dev
```

## Available Scripts

- `npm run dev` - Start development worker with hot reload
- `npm run build` - Build for production
- `npm start` - Start production worker
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

## Queue System

### Queues

The workers process the following queues:

1. **gather** - Fetch pool info, balances, pre-flight checks
2. **trade.buy** - Execute buy transactions
3. **trade.sell** - Execute sell transactions
4. **distribute** - Distribute SOL to wallets
5. **status** - Aggregate campaign metrics
6. **webhook** - Deliver event notifications

### Job Processing

- Jobs are processed with configurable concurrency
- Exponential backoff for retries (max 5-8 attempts)
- Idempotent processing with deterministic job keys
- Dead-letter queue for failed jobs

### Worker Configuration

Configure concurrency via environment variables:

```env
WORKER_CONCURRENCY=10  # Number of concurrent jobs per worker
```

## Project Structure

```
workers/
├── src/
│   ├── types/           # TypeScript types and DTOs
│   ├── core/            # Core business logic
│   │   ├── legacy/      # Migrated CLI code
│   │   ├── services/    # Trading & distribution
│   │   └── config/      # Environment config
│   └── main.ts          # Worker entry point
├── dist/                # Build output
└── package.json
```

## Horizontal Scaling

Workers can be scaled horizontally by running multiple instances:

```bash
# Terminal 1
npm start

# Terminal 2
npm start

# Terminal 3
npm start
```

Each worker will process jobs from the same Redis queue, automatically distributing the load.

## Job Types

### Trade Job (Buy/Sell)

```typescript
{
  type: 'buy' | 'sell',
  mint: 'TokenMintAddress',
  amount: 1000000,
  slippage: 1,
  wallet: 'WalletAddress',
  useJito: true,
  jitoTip: 0.001
}
```

### Gather Job

```typescript
{
  poolId: 'PoolAddress',
  wallets: ['Wallet1', 'Wallet2']
}
```

### Status Job

```typescript
{
  campaignRunId: 'uuid',
  aggregationType: 'summary' | 'detailed'
}
```

## Error Handling

Workers implement robust error handling:

- Network errors: Retry with exponential backoff
- RPC errors: Failover to backup RPC
- Transaction errors: Log and report to status queue
- Critical errors: Move to dead-letter queue for manual intervention

## Monitoring

Workers expose metrics for:

- Queue depth and processing rate
- Job success/failure rates
- Transaction latency
- RPC endpoint health

## Production Deployment

1. Build the application:
   ```bash
   npm run build
   ```

2. Set production environment variables

3. Start the workers (one or more instances):
   ```bash
   npm start
   ```

4. Monitor with Redis CLI:
   ```bash
   redis-cli
   > HGETALL bull:gather:active
   > HGETALL bull:trade.buy:completed
   ```

## Troubleshooting

### Worker not processing jobs

Check Redis connection:
```bash
redis-cli ping
```

Check queue status:
```bash
redis-cli
> KEYS bull:*
```

### High error rate

Check Solana RPC endpoint health:
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
  https://api.mainnet-beta.solana.com
```

### Memory issues

Reduce worker concurrency:
```env
WORKER_CONCURRENCY=5
```

## License

MIT

