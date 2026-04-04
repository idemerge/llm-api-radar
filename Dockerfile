# ---- Stage 1: Build ----
FROM node:20-alpine AS build

# better-sqlite3 needs build tools for native addon
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Backend dependencies
COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci

# Frontend dependencies
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci

# Copy source
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Build backend
RUN cd backend && npm run build

# Build frontend
RUN cd frontend && npx vite build

# ---- Stage 2: Runtime ----
FROM node:20-alpine

# better-sqlite3 native addon needs libstdc++
RUN apk add --no-cache libstdc++

WORKDIR /app

# Copy backend runtime files
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/node_modules ./backend/node_modules
COPY --from=build /app/backend/package.json ./backend/

# Copy frontend built assets
COPY --from=build /app/frontend/dist ./frontend/dist

# Create data directory for SQLite
RUN mkdir -p /app/backend/data

EXPOSE 3001

WORKDIR /app/backend
CMD ["node", "dist/index.js"]
