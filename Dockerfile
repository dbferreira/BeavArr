# ==============================================================================
# Stage 1: Build stage
# ==============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first for Docker layer caching
COPY package*.json ./
RUN npm ci

# Copy full source and compile
COPY . .
RUN npm run build

# ==============================================================================
# Stage 2: Production runtime stage
# ==============================================================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled SvelteKit bundle from builder
COPY --from=builder /app/build ./build

# Run as non-root node user for security
USER node

EXPOSE 3000

CMD ["node", "build/index.js"]
