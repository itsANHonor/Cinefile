# ============================================
# Stage 1: Build Frontend
# ============================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app/client

# Copy frontend package files
COPY client/package*.json ./

# Install frontend dependencies deterministically
RUN npm ci && npm cache clean --force

# Copy frontend source
COPY client/ ./

# Build React application with Vite
RUN npm run build

# ============================================
# Stage 2: Build Backend
# ============================================
FROM node:20-alpine AS backend-builder

WORKDIR /app/server

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Copy backend package files
COPY server/package*.json ./

# Install backend dependencies (including dev for TypeScript)
RUN npm ci

# Copy backend source
COPY server/ ./

# Build TypeScript backend and prune devDependencies for production
RUN npm run build && npm prune --omit=dev && npm cache clean --force

# ============================================
# Stage 3: Production Image
# ============================================
FROM node:20-alpine

WORKDIR /app

# Copy backend build and pruned production dependencies
COPY --from=backend-builder /app/server/dist ./dist
COPY --from=backend-builder /app/server/package*.json ./
COPY --from=backend-builder /app/server/node_modules ./node_modules

# Copy JavaScript migration files
COPY --from=backend-builder /app/server/migrations/*.js ./migrations/

# Create a JavaScript knexfile from the TypeScript config
RUN echo "const path = require('path');" > knexfile.js && \
    echo "" >> knexfile.js && \
    echo "module.exports = {" >> knexfile.js && \
    echo "  client: 'better-sqlite3'," >> knexfile.js && \
    echo "  connection: {" >> knexfile.js && \
    echo "    filename: process.env.DATABASE_PATH || './database.sqlite'" >> knexfile.js && \
    echo "  }," >> knexfile.js && \
    echo "  useNullAsDefault: true," >> knexfile.js && \
    echo "  migrations: {" >> knexfile.js && \
    echo "    directory: path.join(__dirname, 'migrations')," >> knexfile.js && \
    echo "    extension: 'js'" >> knexfile.js && \
    echo "  }" >> knexfile.js && \
    echo "};" >> knexfile.js

# Copy frontend build
COPY --from=frontend-builder /app/client/dist ./public

# Create non-root user for security
RUN addgroup -g 1001 nodejs && \
    adduser -S nodejs -u 1001 && \
    apk add --no-cache su-exec && \
    mkdir -p /data /data/uploads && \
    chown -R nodejs:nodejs /app /data

# Copy entrypoint script
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Don't switch to non-root user here - let entrypoint handle it
# This allows entrypoint to fix permissions on volume mounts
# USER nodejs

# Expose both ports
EXPOSE 3000 3001

# Environment defaults
ENV NODE_ENV=production \
    PORT=3000 \
    READ_ONLY_PORT=3000 \
    ADMIN_PORT=3001 \
    DATABASE_PATH=/data/database.sqlite \
    UPLOAD_DIR=/data/uploads

# Health check (check read-only server)
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]

