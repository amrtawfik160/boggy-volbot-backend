# Solana Volume Bot - Frontend

Next.js frontend application for the Solana Volume Bot platform with Supabase authentication.

## Prerequisites

- Node.js >= 20.x
- npm or pnpm
- Supabase account

## Installation

```bash
npm install
# or
pnpm install
```

## Environment Setup

Create a `.env.local` file in the `frontend` directory:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Development

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

## Features

### Authentication
- Email/password sign up and login
- Session management with Supabase
- Protected routes with middleware
- Automatic redirect to login for unauthenticated users

### Dashboard
- Overview of active campaigns
- 24h volume metrics
- Transaction statistics
- Quick access to create new campaigns

### Campaign Management
- Create and configure campaigns
- Start/stop/pause campaigns
- Real-time status monitoring
- View execution logs

### Wallet Management
- Add custodial wallets
- Manage wallet labels
- View wallet balances
- Track wallet activity

### Token Management
- Register SPL tokens
- View token metadata
- Discover pools for tokens
- Track token performance

### Settings
- Account preferences
- RPC endpoint configuration
- Webhook management
- API key management

## Project Structure

```
frontend/
├── app/
│   ├── (auth)/              # Authentication pages
│   │   ├── login/
│   │   └── signup/
│   ├── (dashboard)/         # Protected dashboard pages
│   │   ├── dashboard/
│   │   ├── campaigns/
│   │   ├── wallets/
│   │   ├── tokens/
│   │   └── settings/
│   └── layout.tsx
├── components/
│   ├── dashboard/           # Dashboard components
│   └── ui/                  # Reusable UI components
├── lib/
│   ├── supabase/           # Supabase client utilities
│   └── utils.ts
├── middleware.ts           # Auth middleware
└── package.json
```

## Routing

The application uses Next.js App Router with route groups:

- `/login` - Login page
- `/signup` - Sign up page
- `/dashboard` - Main dashboard (protected)
- `/campaigns` - Campaign management (protected)
- `/wallets` - Wallet management (protected)
- `/tokens` - Token management (protected)
- `/settings` - Settings page (protected)

## Authentication Flow

1. User visits protected route
2. Middleware checks for valid Supabase session
3. If no session, redirects to `/login`
4. After login, redirects to `/dashboard`
5. Session is automatically refreshed

## Styling

The application uses:
- Tailwind CSS for styling
- Custom components from shadcn/ui
- Responsive design for mobile and desktop
- Dark mode support (optional)

## API Integration

The frontend communicates with the backend API:

```typescript
// Example API call
const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/v1/campaigns`, {
  headers: {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  },
})
```

## Production Deployment

### Vercel (Recommended)

1. Connect your GitHub repository to Vercel
2. Configure environment variables in Vercel dashboard
3. Deploy automatically on push

### Docker

```bash
# Build
docker build -t solana-volume-bot-frontend .

# Run
docker run -p 3000:3000 -e NEXT_PUBLIC_SUPABASE_URL=... solana-volume-bot-frontend
```

### Manual Deployment

```bash
# Build
npm run build

# Start
npm start
```

## Environment Variables

### Required

- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon/public key

### Optional

- `NEXT_PUBLIC_API_URL` - Backend API URL (default: http://localhost:3001)

## Security

- All API requests include Supabase JWT
- Protected routes use middleware authentication
- Environment variables for sensitive data
- No private keys stored in frontend
- HTTPS required in production

## Troubleshooting

### Authentication Issues

Check that your Supabase credentials are correct:
```bash
# Verify environment variables
echo $NEXT_PUBLIC_SUPABASE_URL
echo $NEXT_PUBLIC_SUPABASE_ANON_KEY
```

### API Connection Issues

Check that the backend is running:
```bash
curl http://localhost:3001/health
```

### Build Errors

Clear Next.js cache:
```bash
rm -rf .next
npm run build
```

## License

MIT
