# ---------------------------------------
# Stage 1: Build the client with Vite
# ---------------------------------------
FROM node:20-alpine AS client-builder
WORKDIR /app

# Install deps only for the client
COPY client/package*.json ./client/
RUN cd client && npm i

# Build-time optional override for the client to know the backend URL.
# If you keep your client code using same-origin websockets, you can omit this.
# Example: --build-arg VITE_BACKEND_URL=""
ARG VITE_BACKEND_URL=""
ENV VITE_BACKEND_URL=${VITE_BACKEND_URL}

# Copy client source and build (outputs to ../public/app per vite.config.js)
COPY client ./client
RUN cd client && npm run build

# ---------------------------------------
# Stage 2: Install server deps (prod)
# ---------------------------------------
FROM node:20-alpine AS server-deps
WORKDIR /app

# Install only production deps for the server
COPY package*.json ./
RUN npm i --omit=dev

# ---------------------------------------
# Stage 3: Runtime image
# ---------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app

# Set NODE_ENV for performance
ENV NODE_ENV=production

# Cloud Run/Heroku will inject $PORT; default to 8080 locally
ENV PORT=8080

# Copy server runtime deps and source
COPY --from=server-deps /app/node_modules ./node_modules
COPY index.js socket.js replays.js ./
COPY config ./config
COPY game ./game
COPY routes ./routes
COPY data ./data

# Client build already lands in public/app via vite's outDir
COPY --from=client-builder /app/public ./public

# (Optional but recommended) Use a non-root user for security
# node user exists in the official image
USER node

# Cloud Run expects the server to bind 0.0.0.0:$PORT
EXPOSE 8080

CMD ["node", "index.js"]
