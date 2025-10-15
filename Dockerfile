# ---------------------------------------
# Stage 1: Build the frontend with Vite
# ---------------------------------------
FROM node:20-alpine AS frontend-builder
WORKDIR /app

# Install deps only for frontend
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci

# Build-time optional override for the frontend to know the backend URL.
# If you keep your client code using same-origin websockets, you can omit this.
# Example: --build-arg VITE_BACKEND_URL=""
ARG VITE_BACKEND_URL=""
ENV VITE_BACKEND_URL=${VITE_BACKEND_URL}

# Copy frontend source and build
COPY frontend ./frontend
RUN cd frontend && npm run build

# ---------------------------------------
# Stage 2: Install backend deps (prod)
# ---------------------------------------
FROM node:20-alpine AS backend-deps
WORKDIR /app

# Install only production deps for backend
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# ---------------------------------------
# Stage 3: Runtime image
# ---------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app

# Set NODE_ENV for performance
ENV NODE_ENV=production

# Cloud Run will inject $PORT; default to 8080 locally
ENV PORT=8080

# Copy backend runtime deps and source
COPY --from=backend-deps /app/backend/node_modules ./backend/node_modules
COPY backend ./backend

# Put compiled frontend into backend/public so Express can serve it
RUN mkdir -p backend/public
COPY --from=frontend-builder /app/frontend/dist ./backend/public

# (Optional but recommended) Use a non-root user for security
# node user exists in the official image
USER node

# Cloud Run expects the server to bind 0.0.0.0:$PORT
EXPOSE 8080

# Start the backend (ensure your package.json has "start": "node src/index.js")
CMD ["node", "backend/src/index.js"]
