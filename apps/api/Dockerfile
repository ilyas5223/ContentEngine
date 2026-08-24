# Render worker + API image.
#
# Build from the REPO ROOT, not from apps/api — the build needs the pnpm
# workspace manifests and apps/video's source:
#
#   docker build -f apps/api/Dockerfile -t contentengine-api .
#
# Remotion bundles apps/video from TypeScript source at runtime, so this is a
# single-stage image: the video sources and the bundler's dependencies have to
# survive into the final layer. Chrome and whisper are baked in at build time so
# a cold container renders without downloading anything.

FROM node:22-bookworm-slim

# Chrome Headless Shell's shared libraries — the list Remotion documents for
# Debian. Without these Chrome exits immediately and renders hang.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      libnss3 \
      libdbus-1-3 \
      libatk1.0-0 \
      libgbm-dev \
      libasound2 \
      libxrandr2 \
      libxkbcommon-dev \
      libxfixes3 \
      libxcomposite1 \
      libxdamage1 \
      libatk-bridge2.0-0 \
      libpango-1.0-0 \
      libcairo2 \
      libcups2 \
    && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app

# Manifests first so a source-only change does not reinstall dependencies.
# Every workspace manifest is copied — including apps/web's — because
# --frozen-lockfile validates the lockfile against the whole workspace.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/video/package.json ./apps/video/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

# `@contentengine/api...` selects the API plus its workspace dependencies, so
# the dashboard's Next.js toolchain never lands in this image.
RUN pnpm install --frozen-lockfile --filter "@contentengine/api..."

COPY packages/shared ./packages/shared
COPY apps/video ./apps/video
COPY apps/api ./apps/api

RUN pnpm --filter @contentengine/api build

# Bake Chrome in. Both setup steps go through pnpm --filter so they run with
# apps/api as the working directory: in a pnpm workspace the dependencies are
# under apps/api/node_modules, and a bare `node -e` from /app cannot resolve
# them.
RUN pnpm --filter @contentengine/api setup:chrome

# Bake the whisper CLI + caption model in (~160 MB).
RUN pnpm --filter @contentengine/api setup:whisper

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

WORKDIR /app/apps/api

# src/index.ts imports the BullMQ workers, so this one process serves the API
# and consumes the render queue. Split them when render load needs its own
# scaling: the worker entrypoints are dist/workers/*.worker.js.
CMD ["node", "dist/index.js"]
