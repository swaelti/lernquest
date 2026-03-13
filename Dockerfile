FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

FROM node:20-alpine

WORKDIR /app
RUN apk add --no-cache git

COPY package*.json ./
RUN npm ci --production

COPY --from=builder /app/dist/ ./dist/
COPY content/ ./content/
COPY schema/ ./schema/
COPY frontend/ ./frontend/

# Data directory for SQLite
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=8080
ENV DATA_DIR=/app/data
ENV CONTENT_DIR=/app/content

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://localhost:8080/api/health || exit 1

CMD ["node", "dist/server.js"]
