# Running the Backend API

This guide explains how to run the Solana Volume Bot backend API server.

## Prerequisites

- Node.js 18+ installed
- Redis server (for Bull queues and caching)
- Supabase instance (local or cloud)
- Solana RPC endpoint (optional, uses public endpoints by default)

## Quick Start

### 1. Install Dependencies

```bash
cd backend/api
npm install
```

### 2. Configure Environment Variables

The backend requires a `.env` file in the `backend/api` directory. A template is provided:

```bash
# Copy the .env file if it doesn't exist
cp .env.example .env
```

**Minimum Required Configuration for Development:**

```env
NODE_ENV=development
API_PORT=3001

# Supabase (use your local or cloud instance)
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_key

# Redis
REDIS_URL=redis://localhost:6379

# CORS (allows frontend to connect)
CORS_ORIGIN=http://localhost:3002

# Security (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
MASTER_ENCRYPTION_KEY=your_base64_encoded_32byte_key
```

### 3. Start Required Services

#### Option A: Using Docker (Recommended for Development)

If you have Docker installed, you can start Redis and Supabase easily:

```bash
# Start Redis
docker run -d --name redis -p 6379:6379 redis:alpine

# Start Supabase (requires Docker Compose)
# Follow Supabase local development guide: https://supabase.com/docs/guides/cli/local-development
```

#### Option B: Native Installation

- **Redis**: Install and start Redis on your system
  - macOS: `brew install redis && brew services start redis`
  - Ubuntu: `sudo apt-get install redis-server && sudo service redis-server start`

- **Supabase**: Use cloud instance at [supabase.com](https://supabase.com)

### 4. Run Database Migrations

Before first run, apply database migrations:

```bash
npm run migrate:up
```

### 5. Start the Development Server

```bash
npm run dev
```

The API server will start on `http://localhost:3001`

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build the TypeScript project
- `npm start` - Start production server (requires build first)
- `npm test` - Run tests
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier
- `npm run migrate:up` - Apply database migrations
- `npm run migrate:down` - Rollback last migration
- `npm run migrate:status` - Check migration status

## API Documentation

Once the server is running, access the API documentation at:

- Swagger UI: `http://localhost:3001/api`
- OpenAPI JSON: `http://localhost:3001/api-json`

## Health Check

Verify the API is running:

```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-10-17T12:00:00.000Z"
}
```

## Configuration Details

### Port Configuration

The API runs on port `3001` by default. Change this in `.env`:

```env
API_PORT=3001
```

### CORS Configuration

The API is configured to accept requests from the frontend running on `http://localhost:3002`:

```env
CORS_ORIGIN=http://localhost:3002
```

For production, update this to your production frontend URL.

### Supabase Connection

The backend connects to Supabase for:
- User authentication
- Database operations
- File storage

Get your Supabase credentials from:
`https://app.supabase.com/project/YOUR_PROJECT/settings/api`

### Redis Connection

Redis is used for:
- Bull queues (campaign processing)
- Rate limiting
- Caching

Default connection: `redis://localhost:6379`

## Development Tips

### Watch Mode

The development server uses `ts-node-dev` for hot reload. Changes to TypeScript files will automatically restart the server.

### Debug Logging

Set log level in your code or enable debug mode:

```env
NODE_ENV=development
```

### Testing API Endpoints

Use the Swagger UI at `http://localhost:3001/api` to test API endpoints interactively.

## Troubleshooting

### Port Already in Use

If port 3001 is already in use:

```bash
# Find the process using port 3001
lsof -ti:3001

# Kill the process
kill -9 $(lsof -ti:3001)

# Or change the port in .env
API_PORT=3002
```

### Redis Connection Failed

Ensure Redis is running:

```bash
# Check Redis status
redis-cli ping
# Should return: PONG
```

### Supabase Connection Failed

- Verify `SUPABASE_URL` and keys are correct
- Check if Supabase instance is accessible
- For local Supabase, ensure Docker containers are running

### Database Migrations Failed

If migrations fail, check:
- Supabase connection is working
- Database credentials are correct
- Run `npm run migrate:status` to see current state

## Production Deployment

For production deployment, see:
- `DEPLOYMENT.md` - Deployment guide
- `MAINTENANCE.md` - Maintenance and operations guide

Key production considerations:
- Use production Supabase instance
- Configure proper CORS origins
- Set up Redis cluster for high availability
- Enable Sentry error tracking
- Configure proper logging and monitoring
