# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
# Use legacy peer deps to handle ElizaOS dependency conflicts
RUN npm ci --production=false --legacy-peer-deps || npm install --production=false --legacy-peer-deps

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Runtime stage
FROM node:20-alpine

WORKDIR /app

# Install wget for health checks
RUN apk add --no-cache wget

# Build arguments for SPMC deployment
ARG AGENT_ID
ARG AGENT_CHARACTER
ARG GIT_TAG
ARG GIT_COMMIT_SHA
ARG CONFIG_JSON=""

# Store build metadata as environment variables
ENV AGENT_ID=${AGENT_ID} \
    AGENT_CHARACTER=${AGENT_CHARACTER} \
    GIT_TAG=${GIT_TAG} \
    GIT_COMMIT_SHA=${GIT_COMMIT_SHA} \
    NODE_ENV=production

# Install runtime dependencies only
COPY package*.json ./
RUN npm ci --production --legacy-peer-deps && npm cache clean --force

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts

# Copy character registry
COPY --from=builder /app/src/characters ./src/characters

# Copy configuration files
COPY tsconfig.json ./

# Create directory for database
RUN mkdir -p /app/.eliza/.elizadb

# Create directory for config injection (SPMC will mount config.json here)
RUN mkdir -p /app/config

# Write CONFIG_JSON to /app/config.json if provided
# SPMC passes agent config as build arg for immutable deployment
RUN if [ -n "$CONFIG_JSON" ]; then \
      echo "$CONFIG_JSON" > /app/config.json && \
      echo "✓ Config written to /app/config.json" && \
      echo "Preview (first 3 lines):" && \
      cat /app/config.json | head -3; \
    else \
      echo "⚠ No CONFIG_JSON provided - will use default character or environment config"; \
    fi

# Set PGLITE data directory
ENV PGLITE_DATA_DIR=/app/.eliza/.elizadb

# Expose API port (SPMC requirement)
EXPOSE 8080

# Health check using API endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Run the application with automatic database initialization
# The entrypoint script handles:
# 1. Database initialization (runs setup-agent-db.mjs if needed)
# 2. Starting the agent (npm start)
CMD ["node", "scripts/docker-entrypoint.mjs"]
