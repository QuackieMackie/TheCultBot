# Build context is the repo root (see docker-compose.yml).
FROM node:22.19.0-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/bot/package.json apps/bot/
COPY apps/web/package.json apps/web/
# better-sqlite3 bundles its binaries, so skip npm's compile step.
RUN npm ci --ignore-scripts
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN npm run build --workspace @thecult/web

FROM node:22.19.0-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache su-exec

COPY --from=build --chown=node:node /app/apps/web/build ./build
COPY --from=build --chown=node:node /app/apps/web/package.json ./package.json

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "build/index.js"]
