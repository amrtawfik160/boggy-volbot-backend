# ==========================================
# Multi-Service Backend Dockerfile
# Builds both API and Workers from backend root
# ==========================================

# ==========================================
# Stage 1: Builder - Build both services
# ==========================================
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Set working directory
WORKDIR /app

# Copy root package files (if any)
COPY package*.json ./

# Copy API and Workers directories
COPY api ./api
COPY workers ./workers

# Build API
WORKDIR /app/api
RUN npm ci --only=production=false && npm run build

# Build Workers
WORKDIR /app/workers
RUN npm ci --only=production=false && npm run build

# Clean up dev dependencies
WORKDIR /app/api
RUN npm prune --production

WORKDIR /app/workers
RUN npm prune --production

# ==========================================
# Stage 2: API Service
# ==========================================
FROM node:20-alpine AS api

# Add security: Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy API files from builder
COPY --from=builder --chown=nodejs:nodejs /app/api/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/api/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/api/package*.json ./
COPY --from=builder --chown=nodejs:nodejs /app/api/migrations ./migrations

# Switch to non-root user
USER nodejs

# Expose API port (default 3001, can be overridden)
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.API_PORT || 3001) + '/v1/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the API
CMD ["node", "dist/main.js"]

# ==========================================
# Stage 3: Workers Service
# ==========================================
FROM node:20-alpine AS workers

# Add security: Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy Workers files from builder
COPY --from=builder --chown=nodejs:nodejs /app/workers/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/workers/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/workers/package*.json ./

# Switch to non-root user
USER nodejs

# No port exposure needed for workers

# Health check - verify worker process is running
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD pgrep -f "node dist/main.js" || exit 1

# Start the workers
CMD ["node", "dist/main.js"]
