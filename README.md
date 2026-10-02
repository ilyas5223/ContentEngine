# ContentEngine

**AI content pipeline that turns a topic into a finished vertical video.** It researches the topic, writes a script that doesn't sound robotic, voices it, captions it word by word, cuts stock B-roll to the beat, mixes in music that ducks under the narration, and renders a 1080×1920 MP4 with Remotion.

It runs either as a SaaS (web dashboard → API → job queue → render worker) or as a single CLI command with no database or queue at all.

```bash
pnpm --filter @contentengine/api render --topic "why most diets fail" --template QuickTip
```

---

## The render pipeline

```
topic ─▶ script (LLM) ─▶ voiceover (TTS cascade) ─▶ loudness norm (-16 LUFS)
                                                         │
          captions (whisper word timings) ◀──────────────┘
                     │
   B-roll (Pexels) + beat-snapped cuts + music bed with auto-ducking
                     │
              Remotion render ─▶ 1080×1920 MP4
```

| Stage | How it works |
|---|---|
| **Script** | OpenRouter, free models by default, with a fallback list (`OPENROUTER_MODELS` to override). Prompts are tuned to read like speech, not an essay. |
| **Voiceover** | Provider cascade: ElevenLabs → Kokoro (local) → Piper (local) → Google TTS. A paid key is optional, and a render never hard-fails because one provider is down. |
| **Loudness** | Two-pass ffmpeg `loudnorm` to -16 LUFS / -1.5 dBTP, so every video plays at the same level. If ffmpeg is missing, it skips this step rather than failing. |
| **Captions** | Local whisper (`nodejs-whisper`) produces word-level timings that drive on-screen captions in sync with the voice. |
| **Visuals** | Pexels video B-roll, with cuts snapped to the music's beat timings, plus on-brand video chrome. |
| **Audio bed** | Music ramps down while a word is being spoken and back up between phrases, driven by the caption timings. |
| **Templates** | `QuickTip`, `TopicExplainer`, `TwitterThread` Remotion compositions. |

## Architecture

Turborepo + pnpm monorepo:

| Package | Purpose |
|---|---|
| `apps/web` | Next.js App Router dashboard: Supabase Auth (email + Google), projects, content status |
| `apps/api` | Express API and BullMQ workers (research → content → video) on Redis, plus the standalone render CLI |
| `apps/video` | Remotion compositions, captions, audio bed, beat timings |
| `packages/shared` | Shared TypeScript types |
| `supabase/` | Postgres schema with row-level security (users see only their own projects and content) |

**Auth between web and API:** the dashboard forwards the user's Supabase JWT as a Bearer token, and the API verifies it before any project route runs.

## Deployment

The API/render worker ships as a Docker image with Chrome for Testing, the whisper CLI and the caption model baked in, so a cold container renders without downloading anything. A GitHub Actions workflow builds the image on every relevant change and smoke-tests it on Linux. Development happens on Windows, so CI is where the Linux image gets verified.

```bash
docker build -f apps/api/Dockerfile -t contentengine-api .
docker run --rm -p 4000:4000 --env-file apps/api/.env contentengine-api
```

## Running locally

```bash
pnpm install
cp apps/api/.env.example apps/api/.env    # OPENROUTER_API_KEY + PEXELS_API_KEY are enough to render
pnpm --filter @contentengine/api render --topic "your topic" --template QuickTip
```

Full stack (dashboard + queue): also set the Supabase keys and `REDIS_URL`, apply migrations with `npx supabase db push`, then run `pnpm dev`.

## Stack

TypeScript · Next.js · Express · BullMQ + Redis · Supabase · Remotion · ffmpeg · whisper · Kokoro / Piper / ElevenLabs TTS · OpenRouter · Pexels API · Docker · GitHub Actions

## Contributors

- **Ali Ilyas:** [GitHub](https://github.com/ilyas5223) · [Portfolio](https://aliilyas.vercel.app)
- **Ahmad Waqas:** [GitHub](https://github.com/ahmadwaqas0180-create)
