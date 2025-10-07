# Solana Volume Bot - API Server

NestJS REST API for the Solana Volume Bot platform with Supabase authentication and BullMQ job queue integration.

## Prerequisites

- Node.js >= 20.x
- npm or pnpm
- Redis >= 7.x (for job queues)
- Supabase account (for auth and database)

## Installation

```bash
npm install
# or
pnpm install
```

## Environment Setup

Create a `.env` file in the `backend` directory (see `backend/env.example`):

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Redis
REDIS_URL=redis://localhost:6379

# API
API_PORT=3001

# Solana
SOLANA_RPC_PRIMARY=https://api.mainnet-beta.solana.com
SOLANA_RPC_FALLBACK=https://api.mainnet-beta.solana.com

# Jito (optional)
JITO_KEYPAIR_JSON=...
JITO_TIP_AMOUNT=0.001
```

## Database Setup

1. Run the SQL schema in your Supabase project:
   ```bash
   # Copy SQL from backend/database-schema.sql
   # Paste into Supabase SQL Editor
   ```

2. The schema includes:
   - User profiles and authentication
   - Wallets, tokens, and pools
   - Campaigns and runs
   - Jobs and executions
   - Webhooks and audit logs
   - Row Level Security (RLS) policies

## Development

```bash
# Start Redis
docker run -d -p 6379:6379 redis:7-alpine

# Start API server
npm run dev
```

The API will be available at `http://localhost:3001`

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm test` - Run tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

## API Endpoints

### Authentication

All protected endpoints require a Bearer token from Supabase Auth:

```
Authorization: Bearer <supabase-jwt-token>
```

### Endpoints

- `GET /health` - Health check
- `GET /v1/me` - Current user profile (protected)
- `GET /v1/tokens` - List tokens (protected)
- `POST /v1/tokens` - Register SPL token (protected)
- `GET /v1/pools` - Discover pools for a mint
- `GET /v1/wallets` - List wallets (protected)
- `POST /v1/wallets` - Add wallet (protected)
- `GET /v1/campaigns` - List campaigns (protected)
- `POST /v1/campaigns` - Create campaign (protected)
- `POST /v1/campaigns/:id/start` - Start campaign (protected)
- `POST /v1/campaigns/:id/pause` - Pause campaign (protected)
- `POST /v1/campaigns/:id/stop` - Stop campaign (protected)

## Project Structure

```
api/
├── src/
│   ├── config/           # Configuration (Supabase, etc.)
│   ├── guards/           # Auth guards
│   ├── decorators/       # Custom decorators
│   ├── v1/              # API v1 endpoints
│   ├── types/           # TypeScript types and DTOs
│   ├── core/            # Core business logic
│   │   ├── legacy/      # Migrated CLI code
│   │   ├── services/    # Trading & distribution
│   │   └── config/      # Environment config
│   └── main.ts          # Application entry point
├── dist/                # Build output
└── package.json
```

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

## Production Deployment

1. Build the application:
   ```bash
   npm run build
   ```

2. Set production environment variables

3. Start the server:
   ```bash
   npm start
   ```

## Security

- Wallet private keys are encrypted at rest using AES-256-GCM
- All protected endpoints require Supabase JWT validation
- Input validation using class-validator
- Rate limiting configured per-user and per-IP

## Troubleshooting

### TypeScript errors

```bash
npm run type-check
```

### Redis connection issues

```bash
redis-cli ping
# Should return: PONG
```

### Supabase auth failures

Verify your Supabase credentials in `.env` match your project settings.

## License

MIT

