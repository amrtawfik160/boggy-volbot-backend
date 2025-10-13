# ==========================================
# Stage 1: Builder - Build TypeScript application
# ==========================================
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including dev dependencies for build)
RUN npm ci --only=production=false

# Copy source code
COPY . .

# Build TypeScript to JavaScript
RUN npm run build

# Remove dev dependencies
RUN npm prune --production

# ==========================================
# Stage 2: Production - Minimal runtime image
# ==========================================
FROM node:20-alpine AS production

# Add security: Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy only necessary files from builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./

# Switch to non-root user
USER nodejs

# No port exposure needed for workers (they only connect to Redis/Postgres)

# Health check - verify worker process is running
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD pgrep -f "node dist/main.js" || exit 1

# Start the worker
CMD ["node", "dist/main.js"]
