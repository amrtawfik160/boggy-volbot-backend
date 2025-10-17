# Solana Volume Bot Platform

A complete platform for generating on-chain volume on Solana with a web interface, API backend, and CLI tool.

## Project Structure

This repository contains three independent applications:

```
boggy-volume-bot/
├── Solana-Volume-Bot/    # CLI volume bot (standalone)
├── backend/              # NestJS API + Workers (standalone)
└── frontend/             # Next.js web application (standalone)
```

### Important: No Workspace Dependencies

Each folder is **completely independent** with its own:

-   `package.json` and dependencies
-   `node_modules`
-   Build configuration
-   README and documentation

There is **no pnpm workspace** or monorepo setup. Each application can be developed, built, and deployed separately.

## Quick Start

### 1. CLI Volume Bot

The original CLI-based volume bot for Solana.

```bash
cd Solana-Volume-Bot
npm install
cp .env.example .env
# Configure .env
npm start
```

[📖 Full CLI Documentation →](./Solana-Volume-Bot/README.md)

### 2. Backend API + Workers

NestJS API server and BullMQ workers for the web platform.

```bash
cd backend

# Start API
cd api
npm install
npm run dev

# Start Workers (in another terminal)
cd workers
npm install
npm run dev
```

[📖 Full Backend Documentation →](./backend/README.md)

### 3. Frontend Web Application

Next.js web interface for managing campaigns.

```bash
cd frontend
npm install
npm run dev
```

[📖 Full Frontend Documentation →](./frontend/README.md)

## Architecture Overview

### CLI Volume Bot (`Solana-Volume-Bot/`)

**Purpose**: Standalone command-line tool for volume generation

**Features**:

-   Direct Solana integration
-   Jito MEV support
-   Multiple execution strategies
-   Pool discovery and management
-   Distribution service
-   Status monitoring

**Use Cases**:

-   Quick testing and experimentation
-   Automated scripts
-   Power users who prefer CLI

### Backend (`backend/`)

**Purpose**: Scalable multi-tenant API and job processing

**Components**:

-   `api/` - NestJS REST API with Supabase auth
-   `workers/` - BullMQ workers for job processing

**Features**:

-   Supabase authentication and database
-   Campaign management
-   Wallet encryption and management
-   Redis-backed job queues
-   Real-time status updates
-   Webhook notifications
-   Horizontal scalability

**Tech Stack**:

-   NestJS
-   Supabase (Auth + Postgres)
-   BullMQ + Redis
-   TypeScript

### Frontend (`frontend/`)

**Purpose**: Web interface for managing volume campaigns

**Features**:

-   User authentication (Supabase)
-   Campaign creation and management
-   Wallet management
-   Token and pool discovery
-   Real-time dashboard
-   Settings and preferences

**Tech Stack**:

-   Next.js 15 (App Router)
-   Supabase Auth
-   Tailwind CSS
-   TypeScript

## Data Flow

```
User → Frontend → Backend API → Redis Queue → Workers → Solana
                      ↓              ↓            ↓
                  Supabase DB ← Status Updates ← Execution Results
```

## Prerequisites

### All Applications

-   Node.js >= 20.x
-   npm or pnpm

### Backend & Frontend

-   Redis >= 7.x
-   Supabase account
-   PostgreSQL (via Supabase)

### All Applications

-   Solana RPC endpoint(s)
-   (Optional) Jito keypair for MEV

## Environment Setup

Each application has its own `.env` file:

### CLI (`Solana-Volume-Bot/.env`)

```env
SOLANA_RPC_PRIMARY=https://api.mainnet-beta.solana.com
JITO_KEYPAIR_JSON=...
# See Solana-Volume-Bot/README.md for full list
```

### Backend (`backend/.env`)

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
REDIS_URL=redis://localhost:6379
SOLANA_RPC_PRIMARY=...
# See backend/env.example for full list
```

### Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Database Setup (Backend Only)

The backend requires a Supabase database. Run the schema:

```bash
# In Supabase SQL Editor
# Copy and run: backend/database-schema.sql
```

This creates:

-   User profiles and authentication
-   Wallets, tokens, pools
-   Campaigns and runs
-   Jobs and executions
-   Webhooks and audit logs
-   Row Level Security policies

## Development Workflow

### Work on CLI Only

```bash
cd Solana-Volume-Bot
npm install
npm run dev
```

### Work on Backend Only

```bash
# Terminal 1: Redis
docker run -d -p 6379:6379 redis:7-alpine

# Terminal 2: API
cd backend/api
npm install
npm run dev

# Terminal 3: Workers
cd backend/workers
npm install
npm run dev
```

### Work on Frontend Only

```bash
cd frontend
npm install
npm run dev
```

### Work on Full Platform

```bash
# Terminal 1: Redis
docker run -d -p 6379:6379 redis:7-alpine

# Terminal 2: Backend API
cd backend/api && npm run dev

# Terminal 3: Workers
cd backend/workers && npm run dev

# Terminal 4: Frontend
cd frontend && npm run dev
```

## Production Deployment

Each application deploys independently:

### CLI

-   Package as Docker image
-   Run as cron job or systemd service
-   No external dependencies

### Backend API

```bash
cd backend/api
npm install
npm run build
npm start
```

### Backend Workers

```bash
cd backend/workers
npm install
npm run build
npm start
```

### Frontend

```bash
cd frontend
npm install
npm run build
npm start
```

Or deploy to Vercel:

```bash
cd frontend
vercel deploy
```

## Testing

Each application has its own tests:

```bash
# CLI
cd Solana-Volume-Bot && npm test

# Backend API
cd backend/api && npm test

# Backend Workers
cd backend/workers && npm test

# Frontend
cd frontend && npm test
```

## Key Features

### ✅ Multi-Tenant Platform

-   User authentication and authorization
-   Isolated campaigns per user
-   Row-level security

### ✅ Scalable Architecture

-   Horizontal scaling of API and workers
-   Redis-based job queues
-   Connection pooling

### ✅ Execution Strategies

-   Jito MEV integration
-   Legacy transaction execution
-   Configurable slippage and sizing

### ✅ Monitoring & Observability

-   Real-time campaign status
-   Execution logs and metrics
-   Webhook notifications
-   Audit trails

### ✅ Security

-   Encrypted wallet storage (AES-256-GCM)
-   JWT-based authentication
-   Row-level security policies
-   Input validation

## PRD Compliance

This implementation fulfills the requirements in [PRD.md](./PRD.md):

-   ✅ **Phase 0 - Foundations**: Supabase, Redis, Auth
-   ✅ **Phase 1 - MVP**: Wallets, Campaigns, Jobs, Execution
-   🔄 **Phase 2 - Hardening**: In progress

See [IMPLEMENTATION_SUMMARY.md](./backend/IMPLEMENTATION_SUMMARY.md) for details.

## Troubleshooting

### Redis Connection Issues

```bash
redis-cli ping  # Should return PONG
```

### Supabase Auth Issues

Verify credentials match in Supabase dashboard

### TypeScript Errors

```bash
npm run type-check
```

### Build Failures

```bash
# Clear caches
rm -rf node_modules dist .next
npm install
npm run build
```

## Contributing

1. Each folder is independent - changes don't affect others
2. Run linting before committing: `npm run lint`
3. Run type checking: `npm run type-check`
4. Write tests for new features
5. Update relevant README

## License

MIT

## Documentation

-   [CLI Documentation](./Solana-Volume-Bot/DOCUMENTATION.md)
-   [CLI README](./Solana-Volume-Bot/README.md)
-   [Backend README](./backend/README.md)
-   [Backend Implementation Summary](./backend/IMPLEMENTATION_SUMMARY.md)
-   [Frontend README](./frontend/README.md)
-   [Database Schema](./backend/database-schema.sql)
-   [Product Requirements](./PRD.md)
-   [**Input Validation & Security Strategy**](./docs/VALIDATION_STRATEGY.md) 🔒

## Support

For issues or questions:

1. Check the relevant README in each folder
2. Review troubleshooting sections
3. Check environment variable configuration
4. Verify service dependencies (Redis, Supabase) are running

---

**Note**: This is not a monorepo. Each folder (`Solana-Volume-Bot`, `backend`, `frontend`) is a completely independent application with its own dependencies, build process, and deployment strategy.
