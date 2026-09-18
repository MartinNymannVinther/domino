# Production image for Domino. Multi-stage:
#   deps      -> install node_modules once
#   prod-deps -> the same install without the development tree
#   build     -> next build (standalone output)
#   migrator  -> minimal image that runs drizzle migrations (compose "migrate")
#   runner    -> non-root runtime serving the standalone build

# Node 25 and later no longer ship corepack, so pnpm is installed outright.
# Keep this version in step with "packageManager" in package.json.
ARG PNPM_VERSION=10.28.0

FROM node:26-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
ARG PNPM_VERSION
RUN npm install -g "pnpm@${PNPM_VERSION}"
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# The same install without the development tree, for the migrator. It is
# its own stage rather than a `pnpm prune` on top of deps, so nothing that
# only ever existed for the build can be left behind by a prune that
# missed it.
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The build stamp the running app reports. .dockerignore excludes .git, so
# the commit has to be handed in; without it the app honestly says
# "unknown" rather than guessing.
ARG DOMINO_COMMIT=""
ARG DOMINO_BUILT_AT=""
ENV DOMINO_COMMIT=$DOMINO_COMMIT DOMINO_BUILT_AT=$DOMINO_BUILT_AT
# Dummy values so importing env-validated modules never fails at build time;
# real values come from the environment at runtime.
ENV APP_DATABASE_URL=postgres://build:build@localhost:5432/build \
    AUTH_DATABASE_URL=postgres://build:build@localhost:5432/build \
    BETTER_AUTH_SECRET=build-time-placeholder \
    BETTER_AUTH_URL=http://localhost:3000
RUN pnpm build

# The migrator carries the production tree only. This image holds the
# Postgres superuser connection string, and eslint, vitest, prettier and
# the shadcn CLI have no business standing next to it.
#
# A --prod install was tried at the launch and reverted the same hour:
# `pnpm db:migrate` runs the scripts through tsx, tsx was a development
# dependency, and the step died with `sh: tsx: not found` after the
# database was already up. The fix was to stop lying about tsx. It runs
# in production, on every deploy, and so does dotenv (both migration
# scripts open with `import "dotenv/config"`); both are dependencies now.
# The CI step that runs this image against a port nobody listens on is
# what keeps that honest.
FROM base AS migrator
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json drizzle.config.ts ./
COPY drizzle ./drizzle
COPY src/core/db/schema ./src/core/db/schema
# The migration step is our own script (it names its failures) and role
# provisioning runs with it; see scripts/migrate.ts and ensure-roles.ts.
COPY scripts/migrate.ts scripts/ensure-roles.ts ./scripts/
USER node
CMD ["pnpm", "db:migrate"]

FROM base AS runner
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
