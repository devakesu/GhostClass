# ===============================
# 0. Global deterministic settings
# ===============================
ARG NODE_IMAGE=node:20.19.2-alpine3.20@sha256:6e0e1a13235997255e6f36fd3da4169d99b5e87c0de01dc08300359d23224c33
ARG SOURCE_DATE_EPOCH=1767225600

# ===============================
# 0.1. Base layer with npm upgrade (pinned by hash)
# ===============================
FROM ${NODE_IMAGE} AS base

# Update npm to version 11 without using `npm install -g` (avoids scorecard "npmCommand not pinned" flag).
# /usr/local/bin/npm already symlinks to /usr/local/lib/node_modules/npm/bin/npm-cli.js,
# so overwriting that directory via tar achieves the same result with no unpinned npm invocation.
# The tarball is verified by SHA-256 before extraction.
RUN apk add --no-cache wget && \
  wget -O /tmp/npm.tgz https://registry.npmjs.org/npm/-/npm-11.10.0.tgz && \
  echo "43c653384c39617756846ad405705061a78fb6bbddb2ced57ab79fb92e8af2a7  /tmp/npm.tgz" | sha256sum -c - && \
  rm -rf /usr/local/lib/node_modules/npm && \
  mkdir -p /usr/local/lib/node_modules/npm && \
  tar -xz --strip-components=1 -C /usr/local/lib/node_modules/npm -f /tmp/npm.tgz && \
  rm /tmp/npm.tgz && \
  rm -rf /var/cache/apk/*

# ===============================
# 1. Dependencies layer
# ===============================
FROM base AS deps

ARG SOURCE_DATE_EPOCH
ENV SOURCE_DATE_EPOCH=${SOURCE_DATE_EPOCH}
ENV TZ=UTC

# Install only required native dependencies
RUN apk add --no-cache \
    libc6-compat \
    && rm -rf /var/cache/apk/*

WORKDIR /app

ARG APP_COMMIT_SHA
ENV APP_COMMIT_SHA=${APP_COMMIT_SHA}

COPY package.json package-lock.json ./

# Use npm ci (installs all deps for building)
# Note: npm cache clean --force is omitted here to speed up the build.
# The multi-stage build ensures the npm cache is not included in the final image.
# Next.js standalone output (used in builder stage) automatically tree-shakes dependencies,
# excluding devDependencies from the final production bundle in .next/standalone/node_modules.
RUN npm ci \
    --ignore-scripts \
    --no-audit \
    --no-fund \
    --prefer-offline \
    --legacy-peer-deps

# ===============================
# 2. Build layer
# ===============================
FROM base AS builder

ARG SOURCE_DATE_EPOCH
ARG APP_COMMIT_SHA
ARG GITHUB_REPOSITORY
ARG GITHUB_RUN_ID
ARG GITHUB_RUN_NUMBER
ARG BUILD_TIMESTAMP
ARG AUDIT_STATUS
ARG SIGNATURE_STATUS
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ARG NEXT_PUBLIC_SENTRY_DSN

ENV SOURCE_DATE_EPOCH=${SOURCE_DATE_EPOCH}
ENV APP_COMMIT_SHA=${APP_COMMIT_SHA}
ENV NEXT_PUBLIC_GIT_COMMIT_SHA=${APP_COMMIT_SHA}
ENV GITHUB_REPOSITORY=${GITHUB_REPOSITORY}
ENV GITHUB_RUN_ID=${GITHUB_RUN_ID}
ENV GITHUB_RUN_NUMBER=${GITHUB_RUN_NUMBER}
ENV BUILD_TIMESTAMP=${BUILD_TIMESTAMP}
ENV AUDIT_STATUS=${AUDIT_STATUS}
ENV SIGNATURE_STATUS=${SIGNATURE_STATUS}
ENV TZ=UTC
ENV NODE_ENV=production
ENV TURBOPACK=0
ENV SENTRY_ORG=${SENTRY_ORG}
ENV SENTRY_PROJECT=${SENTRY_PROJECT}
ENV NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN}
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PRIVATE_BUILD_WORKER_COUNT=1
ENV NODE_OPTIONS="--max-old-space-size=2560"

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --link . .

# ---------------------------------------
# Public Next.js envs (compile-time)
# ---------------------------------------
ARG NEXT_PUBLIC_BACKEND_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_GITHUB_URL
ARG NEXT_PUBLIC_APP_NAME
ARG NEXT_PUBLIC_APP_VERSION
ARG NEXT_PUBLIC_APP_DOMAIN
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SITEMAP_URL
ARG NEXT_PUBLIC_APP_EMAIL
ARG NEXT_PUBLIC_AUTHOR_NAME
ARG NEXT_PUBLIC_AUTHOR_URL
ARG NEXT_PUBLIC_LEGAL_EMAIL
ARG NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_GA_ID

ENV NEXT_PUBLIC_BACKEND_URL=${NEXT_PUBLIC_BACKEND_URL}
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
ENV NEXT_PUBLIC_GITHUB_URL=${NEXT_PUBLIC_GITHUB_URL}
ENV NEXT_PUBLIC_APP_NAME=${NEXT_PUBLIC_APP_NAME}
ENV NEXT_PUBLIC_APP_VERSION=${NEXT_PUBLIC_APP_VERSION}
ENV NEXT_PUBLIC_APP_DOMAIN=${NEXT_PUBLIC_APP_DOMAIN}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_SITEMAP_URL=${NEXT_PUBLIC_SITEMAP_URL}
ENV NEXT_PUBLIC_APP_EMAIL=${NEXT_PUBLIC_APP_EMAIL}
ENV NEXT_PUBLIC_AUTHOR_NAME=${NEXT_PUBLIC_AUTHOR_NAME}
ENV NEXT_PUBLIC_AUTHOR_URL=${NEXT_PUBLIC_AUTHOR_URL}
ENV NEXT_PUBLIC_LEGAL_EMAIL=${NEXT_PUBLIC_LEGAL_EMAIL}
ENV NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE=${NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE}
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=${NEXT_PUBLIC_TURNSTILE_SITE_KEY}
ENV NEXT_PUBLIC_GA_ID=${NEXT_PUBLIC_GA_ID}
ENV SERWIST_SUPPRESS_TURBOPACK_WARNING=1

# Validate required build args
RUN set -e; \
  : "${APP_COMMIT_SHA:?APP_COMMIT_SHA is required}"; \
  : "${NEXT_PUBLIC_BACKEND_URL:?NEXT_PUBLIC_BACKEND_URL is required}"; \
  : "${NEXT_PUBLIC_SUPABASE_URL:?NEXT_PUBLIC_SUPABASE_URL is required}"; \
  : "${NEXT_PUBLIC_SUPABASE_ANON_KEY:?NEXT_PUBLIC_SUPABASE_ANON_KEY is required}"; \
  : "${NEXT_PUBLIC_APP_NAME:?NEXT_PUBLIC_APP_NAME is required}"; \
  : "${NEXT_PUBLIC_APP_VERSION:?NEXT_PUBLIC_APP_VERSION is required}"; \
  : "${NEXT_PUBLIC_APP_DOMAIN:?NEXT_PUBLIC_APP_DOMAIN is required}"; \
  : "${NEXT_PUBLIC_APP_URL:?NEXT_PUBLIC_APP_URL is required}"; \
  : "${NEXT_PUBLIC_SITEMAP_URL:?NEXT_PUBLIC_SITEMAP_URL is required}"; \
  : "${NEXT_PUBLIC_APP_EMAIL:?NEXT_PUBLIC_APP_EMAIL is required}"; \
  : "${NEXT_PUBLIC_AUTHOR_NAME:?NEXT_PUBLIC_AUTHOR_NAME is required}"; \
  : "${NEXT_PUBLIC_AUTHOR_URL:?NEXT_PUBLIC_AUTHOR_URL is required}"; \
  : "${NEXT_PUBLIC_LEGAL_EMAIL:?NEXT_PUBLIC_LEGAL_EMAIL is required}"; \
  : "${NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE:?NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE is required}"; \
  : "${NEXT_PUBLIC_TURNSTILE_SITE_KEY:?NEXT_PUBLIC_TURNSTILE_SITE_KEY is required}"; \
  : "${NEXT_PUBLIC_GA_ID:?NEXT_PUBLIC_GA_ID is required}";

# Build with minimal resources and clean cache
RUN --mount=type=secret,id=sentry_token \
    export SENTRY_AUTH_TOKEN=$(cat /run/secrets/sentry_token) && \
    npm run build && \
    rm -rf .next/cache

# Compile service worker with runtime caching
# @serwist/next doesn't generate SW with standalone mode, so we compile src/sw.ts manually using esbuild
# Note: Precaching is disabled (self.__SW_MANIFEST='[]') since we don't have a build-time manifest;
# runtime caching strategies (NetworkFirst, CacheFirst, StaleWhileRevalidate) can only serve previously cached resources offline (full offline support would require precaching or explicit caching logic)
RUN if [ ! -f "public/sw.js" ]; then \
      echo "Compiling service worker from src/sw.ts..."; \
      ./node_modules/.bin/esbuild src/sw.ts \
        --bundle \
        --outfile=public/sw.js \
        --format=iife \
        --target=es2020 \
        --minify \
        --define:self.__SW_MANIFEST='[]' \
        --platform=browser \
        --log-level=warning && \
      echo "✓ Service worker compiled: $(du -h public/sw.js | cut -f1)"; \
    else \
      echo "✓ Service worker already exists"; \
    fi

# 2. Normalize timestamps
RUN find .next -exec touch -d "@${SOURCE_DATE_EPOCH}" {} +

# 3. Normalize absolute paths in standalone server
RUN sed -i 's|/app/|/|g' .next/standalone/server.js

# ===============================
# 3. Runtime layer
# ===============================
FROM ${NODE_IMAGE} AS runner

ARG SOURCE_DATE_EPOCH
ARG APP_COMMIT_SHA
ARG GITHUB_REPOSITORY
ARG GITHUB_RUN_ID
ARG GITHUB_RUN_NUMBER
ARG BUILD_TIMESTAMP
ARG AUDIT_STATUS
ARG SIGNATURE_STATUS
ENV SOURCE_DATE_EPOCH=${SOURCE_DATE_EPOCH}
ENV APP_COMMIT_SHA=${APP_COMMIT_SHA}
ENV GITHUB_REPOSITORY=${GITHUB_REPOSITORY}
ENV GITHUB_RUN_ID=${GITHUB_RUN_ID}
ENV GITHUB_RUN_NUMBER=${GITHUB_RUN_NUMBER}
ENV BUILD_TIMESTAMP=${BUILD_TIMESTAMP}
ENV AUDIT_STATUS=${AUDIT_STATUS}
ENV SIGNATURE_STATUS=${SIGNATURE_STATUS}
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Node.js memory limit: 2.5GB (leave 1.5GB for OS/Redis/other processes)
# Adjust based on server RAM: 2GB server = 1536, 4GB server = 2560, 8GB server = 6144
ENV NODE_OPTIONS="--max-old-space-size=2560"

# Build argument for customizable hostname binding
# Override at build time with: --build-arg NEXT_HOSTNAME=127.0.0.1 for localhost-only binding
ARG NEXT_HOSTNAME="0.0.0.0"

# NOTE: HOSTNAME controls the network interface binding (listen address), not the public URL hostname.
# When binding to 0.0.0.0, this container must be deployed behind a reverse proxy, firewall,
# or equivalent network control; direct external access to the container must be prevented.
# For the full security checklist and deployment patterns, see docs/SECURITY.md.
ENV HOSTNAME="${NEXT_HOSTNAME}"

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    apk add --no-cache wget

# Core Next.js output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Copy public folder including the generated service worker
# The sw.js file is compiled by esbuild during Docker build (standalone mode workaround)
# as @serwist/next doesn't generate it with output: "standalone"
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Clean up
RUN rm -rf \
    /usr/share/man/* \
    /usr/share/doc/* \
    /var/cache/apk/* \
    /tmp/* \
    /root/.npm \
    /root/.cache

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:80/api/health || exit 1

CMD ["node", "server.js"]