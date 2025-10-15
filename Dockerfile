# Use a multi-stage build to first build the frontend
FROM node:18-alpine as frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Build the backend
FROM node:18-alpine as backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install
COPY backend/ ./

# Final stage to combine the built assets
FROM node:18-alpine
WORKDIR /app
COPY --from=backend-builder /app/backend ./backend
COPY --from=frontend-builder /app/frontend/build ./backend/build

# Use the backend directory as the working directory
WORKDIR /app/backend
# Set the command to run the backend server
CMD ["node", "src/index.js"]
