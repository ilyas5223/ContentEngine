# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ContentEngine is an AI Content Agency SaaS. It researches trends, generates content (videos, posts, articles), and manages the pipeline via a job queue.

## Monorepo Structure

Turborepo + pnpm workspaces:

| Package | Purpose |
|---|---|
| `apps/web` | Next.js 14 App Router — user-facing dashboard |
| `apps/api` | Express.js — job dispatch, webhooks, BullMQ producers |
| `apps/video` | Remotion — 1080×1920 vertical video compositions |
| `packages/shared` | Shared TypeScript types and utilities |

## Common Commands

```bash
# From repo root
pnpm dev          # start all apps in parallel
pnpm build        # build all apps
pnpm lint         # lint all apps
pnpm type-check   # type-check all apps

# Per app
pnpm --filter @contentengine/web dev
pnpm --filter @contentengine/api dev

# Render a video locally — no Supabase, no Redis, no web app.
# Needs only OPENROUTER_API_KEY + PEXELS_API_KEY in apps/api/.env
pnpm --filter @contentengine/api render --topic "why most diets fail" --template QuickTip
```

## Docker (apps/api)

Build from the repo root — the image needs the workspace manifests and
`apps/video`'s source, because Remotion bundles the compositions from
TypeScript at render time:

```bash
docker build -f apps/api/Dockerfile -t contentengine-api .
docker run --rm -p 4000:4000 --env-file apps/api/.env contentengine-api
```

Chrome (`chrome-for-testing`, matching `services/render.ts`) and the whisper
CLI + caption model are baked in at build time, so a cold container renders
without downloading anything. The install step filters to
`@contentengine/api...`, which pulls in `video` and `shared` but leaves the
dashboard's Next.js toolchain out of the image.

`.dockerignore` excludes `apps/api/vendor` — the host's whisper build is
platform-specific, and `setup:whisper` refetches the Linux archive during the
build. Music `.mp3`s are gitignored and therefore absent from the image;
`resolveMusicTrack()` intersects the manifest with what actually shipped, so
renders come out silent rather than broken.

## Architecture

**Auth**: Supabase Auth with SSR. Middleware in `apps/web/src/middleware.ts` protects all routes except `/login`, `/signup`, `/auth/callback`. Google OAuth redirects to `/auth/callback` (PKCE exchange). Logout is a POST form to `/logout`.

**Route groups (apps/web)**:
- `app/(auth)/` — login, signup, logout (URL: `/login`, `/signup`, `/logout`)
- `app/(dashboard)/` — shared nav layout; contains `dashboard/`, `projects/`, `projects/new/`, `projects/[id]/`
- `app/auth/callback/` — OAuth code exchange

**Database**: Supabase (PostgreSQL). All tables have RLS enabled — users access only their own data via `auth.uid() = user_id`. For `research_results` and `content_items`, ownership is checked through a subquery to `projects`. Migration: `supabase/migrations/20240001_initial_schema.sql`.

**Supabase clients**:
- Browser: `apps/web/src/lib/supabase/client.ts` — uses anon key
- Server Components / Actions: `apps/web/src/lib/supabase/server.ts` — uses anon key with cookie management
- API server: `apps/api/src/services/supabase.ts` — uses **service role key** (`supabaseAdmin`, bypasses RLS)

**API auth flow**: Express middleware in `apps/api/src/middleware/auth.ts` extracts the `Authorization: Bearer <token>` header, calls `supabaseAdmin.auth.getUser(token)`, and attaches `req.userId`. All project routes use this middleware.

**API client (web → api)**: `apps/web/src/lib/api.ts` — typed wrapper that reads the current Supabase session and injects the JWT as Bearer. Use `projectsApi.*` for project CRUD.

**Server actions**: The "new project" form uses a Next.js Server Action that calls Supabase directly (no round-trip to the Express API needed for simple writes).

**Job Queue**: BullMQ + Redis. The API server acts as the producer; workers (added in later phases) consume jobs from Redis queues.

**Shared types**: Import from `@contentengine/shared`. Core types: `User`, `Project`, `ResearchResult`, `ContentItem`, and their status/type unions.

## Environment Variables

Copy `.env.example` → `.env` in each app before running locally.

- `apps/web/.env.example` — needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `apps/api/.env.example` — needs `OPENROUTER_API_KEY` + `PEXELS_API_KEY` for rendering; Supabase keys and `REDIS_URL` on top of that for the full web app

## Database

Apply migrations with:
```bash
npx supabase db push
```

The `handle_new_user` trigger auto-creates a `public.users` row on Supabase Auth signup, copying `full_name` from `raw_user_meta_data`.
