# Running the Frontend Application

This guide explains how to run the Solana Volume Bot frontend application built with Next.js.

## Prerequisites

- Node.js 18+ installed
- Backend API running (see `backend/RUNNING_BACKEND.md`)
- npm or pnpm package manager

## Quick Start

### 1. Install Dependencies

```bash
cd frontend
npm install
# or
pnpm install
```

### 2. Configure Environment Variables

The frontend requires a `.env` file in the `frontend` directory:

```bash
# Create .env file
touch .env
```

**Required Configuration:**

```env
# Base URL
BASE_URL=/

# API Configuration (points to backend API)
NEXT_PUBLIC_API_URL=http://localhost:3001

# Supabase Configuration (for authentication)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

**Current Configuration:**

The `.env` file is already configured with:
- API URL: `http://localhost:3001` (connects to backend)
- Supabase URL: Production instance

### 3. Start the Development Server

```bash
npm run dev
# or
pnpm dev
```

The frontend will start on `http://localhost:3000` by default.

**Note:** If port 3000 is already in use, Next.js will automatically use the next available port (e.g., 3002).

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build the production application
- `npm start` - Start production server (requires build first)
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

## Accessing the Application

Once the server is running, open your browser to:

- Default: `http://localhost:3000`
- Or the port shown in terminal: `http://localhost:3002`

You'll see:
```
▲ Next.js 15.5.0
- Local:        http://localhost:3002
- Network:      http://192.168.x.x:3002
```

## Application Features

The frontend provides:

- **Dashboard**: Overview of all campaigns and statistics
- **Campaign Management**: Create and manage volume bot campaigns
- **Wallet Management**: Manage trading wallets and distribute SOL
- **Real-time Updates**: WebSocket connection for live campaign status
- **Transaction History**: View all campaign transactions
- **Analytics**: Charts and metrics for campaign performance

## Configuration Details

### API Connection

The frontend connects to the backend API via the `NEXT_PUBLIC_API_URL` environment variable:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

This must match the backend API server address.

### Supabase Authentication

The frontend uses Supabase for user authentication:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

These credentials should match your backend Supabase configuration.

### Environment Variables

All environment variables prefixed with `NEXT_PUBLIC_` are exposed to the browser.

**Never include sensitive keys in `NEXT_PUBLIC_` variables!**

## Development Tips

### Hot Reload

Next.js automatically reloads when you save changes to:
- Components (`src/components/`)
- Pages (`src/app/`)
- Styles (`src/styles/`)

### TypeScript Support

The project uses TypeScript. Type checking runs automatically during development.

### API Integration

API calls are handled through:
- `src/lib/api.ts` - API client configuration
- `src/hooks/` - React hooks for data fetching

### WebSocket Connection

Real-time updates use Socket.IO:
- Connects to backend WebSocket server
- Automatically reconnects on connection loss
- Receives campaign status updates

## Troubleshooting

### Port Already in Use

If port 3000 (or 3002) is in use:

```bash
# Find and kill the process
lsof -ti:3000 | xargs kill -9

# Or Next.js will automatically use next available port
```

### API Connection Failed

If the frontend can't connect to the backend:

1. **Verify backend is running:**
   ```bash
   curl http://localhost:3001/health
   ```

2. **Check CORS configuration** in backend `.env`:
   ```env
   CORS_ORIGIN=http://localhost:3002
   ```

3. **Verify API URL** in frontend `.env`:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:3001
   ```

### Build Errors

If you encounter build errors:

```bash
# Clear Next.js cache
rm -rf .next

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Rebuild
npm run build
```

### Supabase Authentication Issues

If authentication doesn't work:

1. Verify Supabase credentials in `.env`
2. Check if Supabase project is active
3. Ensure frontend and backend use same Supabase project
4. Check browser console for error messages

### Lockfile Warnings

If you see warnings about multiple lockfiles:

```
Warning: Detected additional lockfiles: pnpm-lock.yaml
```

This is informational. To silence it, either:
- Remove `pnpm-lock.yaml` if you use npm
- Or add to `next.config.js`:
  ```js
  outputFileTracingRoot: path.join(__dirname, '../../')
  ```

## Production Build

To create a production build:

```bash
# Build the application
npm run build

# Start production server
npm start
```

The production server will run on port 3000 by default.

### Production Environment Variables

For production, update `.env` or `.env.production`:

```env
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_production_anon_key
```

## Connecting Frontend and Backend

The frontend and backend communicate via:

### 1. REST API
- Frontend calls: `http://localhost:3001/api/*`
- Backend CORS allows: `http://localhost:3002`

### 2. WebSocket
- Frontend connects: `ws://localhost:3001`
- Real-time campaign updates

### 3. Authentication
- Both use same Supabase instance
- JWT tokens validated by backend

## Next Steps

- Explore the API documentation: `http://localhost:3001/api`
- Read the backend guide: `../backend/RUNNING_BACKEND.md`
- Check deployment guide: `../DEPLOYMENT.md`

## Support

For issues or questions:
- Check backend logs for API errors
- Check browser console for frontend errors
- Review `README.md` for project overview
