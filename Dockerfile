# ---------------------------------------
# Stage 1: Build the client with Vite
# ---------------------------------------
FROM node:22-alpine AS client-builder
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
FROM node:22-alpine AS server-deps
WORKDIR /app

# Install only production deps for the server
COPY package*.json ./
RUN npm i --omit=dev

# ---------------------------------------
# Stage 3: Runtime image
# ---------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

# Set NODE_ENV for performance
ENV NODE_ENV=production

# Cloud Run/Heroku will inject $PORT; default to 8080 locally
ENV PORT=8080

# Copy server runtime deps and source. *.js picks up every root-level
# module (index.js, socket.js, replays.js, discord.js, feedback.js,
# battleLogSummary.js, aiBattleSummary.js, ...) instead of naming each one,
# so a new root-level file doesn't silently go missing from the image the
# way discord.js/feedback.js/aiBattleSummary.js/battleLogSummary.js and the
# whole db/ directory previously did here — that omission meant every one
# of those ESM imports would fail at container startup (Node resolves all
# static imports before any code runs, so this crashed immediately, not
# just when the missing feature was used).
COPY --from=server-deps /app/node_modules ./node_modules
COPY *.js ./
COPY config ./config
COPY game ./game
COPY routes ./routes
COPY data ./data
COPY db ./db

# Client build already lands in public/app via vite's outDir
COPY --from=client-builder /app/public ./public

# replays.js/feedback.js write JSON files under data/replays and
# data/feedback at runtime (Save Replay, Report a Bug). Those two
# directories are gitignored (data/replays/, data/feedback/), so a fresh
# checkout/Cloud Build clone never has them, and everything copied above
# was copied as root. Without this, the non-root `node` user below can't
# create files there (EACCES: permission denied) — which is exactly what
# broke Save Replay silently on Cloud Run: the handler had no error
# handling, so the permission failure never reached the player, the button
# just did nothing. Pre-creating the dirs and handing them to `node` here
# fixes the root cause; socket.js/feedback error handling (see those files)
# is the belt-and-suspenders fix so a future filesystem issue is never
# silent again.
RUN mkdir -p data/replays data/feedback && chown -R node:node data

# (Optional but recommended) Use a non-root user for security
# node user exists in the official image
USER node

# Cloud Run expects the server to bind 0.0.0.0:$PORT
EXPOSE 8080

CMD ["node", "index.js"]
