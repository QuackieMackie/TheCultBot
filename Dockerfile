FROM node:20.18.1-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20.18.1-alpine AS runtime

ENV NODE_ENV=production \
    NODE_PATH=/app/dist \
    CULTBOT_DATA_DIR=/app/data

RUN apk add --no-cache su-exec

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build --chown=node:node /app/dist ./dist

RUN mkdir -p /app/data && chown -R node:node /app/data

ENTRYPOINT ["/bin/sh", "-c", "chown -R node:node /app/data 2>/dev/null || true; exec su-exec node node dist/index.js"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
    CMD node -e "const fs=require('fs');try{const age=Date.now()-Number(fs.readFileSync('/app/data/heartbeat','utf8'));process.exit(age<90000?0:1)}catch{process.exit(1)}"
