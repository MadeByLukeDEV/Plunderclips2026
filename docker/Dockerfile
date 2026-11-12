# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=24-alpine

FROM node:${NODE_VERSION} AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/ui/package.json packages/ui/
COPY packages/modules/identity/package.json packages/modules/identity/
COPY packages/modules/clips/package.json packages/modules/clips/
COPY packages/modules/creators/package.json packages/modules/creators/
COPY packages/modules/moderation/package.json packages/modules/moderation/
COPY packages/modules/social/package.json packages/modules/social/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# Public site URL, needed at build time for absolute metadata URLs (Open Graph, canonical).
# Nothing secret goes into the image: runtime config comes from the environment.
ARG SITE_URL=http://localhost:3000
ENV NEXT_TELEMETRY_DISABLED=1 SITE_URL=${SITE_URL}
RUN pnpm --filter @plunderclips/web build

# One-shot migration runner (compose service `migrate`). Exits 0 when the schema is up to date.
FROM deps AS migrate
COPY packages packages
ENV NODE_ENV=production
WORKDIR /repo/packages/db
CMD ["node", "migrate.mjs"]

FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /repo/apps/web/.next/standalone ./
COPY --from=build --chown=app:app /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=app:app /repo/apps/web/public ./apps/web/public
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "apps/web/server.js"]
