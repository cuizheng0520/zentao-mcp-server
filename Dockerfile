FROM node:18-alpine AS builder

WORKDIR /app

# Build native deps if needed by transitive packages
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

FROM node:18-alpine

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Runtime deps only
RUN npm ci --omit=dev

# Expose stdio MCP over HTTP for URL-based clients
RUN npm install -g supergateway

ENV NODE_ENV=production \
    MCP_SERVER_PORT=3000 \
    ZENTAO_URL="" \
    ZENTAO_USERNAME="" \
    ZENTAO_PASSWORD="" \
    ZENTAO_API_VERSION="v1"

EXPOSE 3000

CMD ["sh", "-lc", "supergateway --port ${MCP_SERVER_PORT:-3000} --stdio 'node dist/index.js'"]
