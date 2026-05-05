import path from 'path'
import fs from 'fs'
import os from 'os'
import { Worker, type Job } from 'bullmq'
import { bundle } from '@remotion/bundler'
import { selectComposition, renderMedia, ensureBrowser } from '@remotion/renderer'
import { supabaseAdmin } from '../services/supabase'
import { generateText } from '../lib/llm'
import { synthesize as synthesizeTts } from '../services/tts'
import { transcribeWords, type WordTiming } from '../services/captions'
import {
  makeRedisConnection,
  type VideoJobData,
  type VideoTemplate,
} from '../services/queue'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Beat {
  narration: string
  onScreen: string
}

interface Beats {
  hook: Beat
  points: Beat[]
  payoff: Beat
  cta: Beat
}

interface VideoScript {
  title: string
  narration: string
  bullets: string[]
  keywords: string[]
  cta: string
  beats: Beats
}

interface PexelsPhoto {
  id: number
  src: {
    large2x: string
    large: string
    original: string
  }
}

interface PexelsPhotoResponse {
  photos: PexelsPhoto[]
}

interface PexelsVideoFile {
  link: string
  width: number
  height: number
  file_type: string
  quality: string
}

interface PexelsVideo {
  id: number
  duration: number
  width: number
  height: number
  video_files: PexelsVideoFile[]
}

interface PexelsVideoResponse {
  videos: PexelsVideo[]
}

type MediaItem = { type: 'image' | 'video'; url: string; duration?: number }

// ---------------------------------------------------------------------------
// Remotion bundle cache (per worker process)
// ---------------------------------------------------------------------------

let cachedServeUrl: string | null = null

async function getServeUrl(): Promise<string> {
  if (cachedServeUrl) return cachedServeUrl
  // Resolve from apps/api/src/workers to apps/video/src/index.ts.
  // Works for tsx dev (src/) and compiled dist/ (dist/workers/).
  const entry = path.resolve(__dirname, '../../../video/src/index.ts')
  console.log('[video-worker] bundling Remotion entry:', entry)
  cachedServeUrl = await bundle({
    entryPoint: entry,
    webpackOverride: (config) => config,
  })
  return cachedServeUrl
}

// Warm up Chrome + Remotion bundle before the worker accepts jobs.
// Without this, the first job dequeues while Chrome is still downloading
// and webpack bundling blocks the event loop, starving BullMQ's lock-renewal
// timer and stalling the job.
const warmup = (async () => {
  await ensureBrowser()
  await getServeUrl()
  console.log('[video-worker] warmup complete')
})().catch((err) => {
  console.warn('[video-worker] warmup failed; first job will retry:', err)
})

// ---------------------------------------------------------------------------
// Helper: set progress_step on the content_item (triggers Realtime)
// ---------------------------------------------------------------------------

async function setStep(contentItemId: string, step: string) {
  await supabaseAdmin
    .from('content_items')
    .update({ progress_step: step })
    .eq('id', contentItemId)
}

// ---------------------------------------------------------------------------
// Step 1: Script generation via Gemini
// ---------------------------------------------------------------------------

function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  return fenced ? fenced[1].trim() : text.trim()
}

// Tokens that scream "AI wrote this." Validator re-rolls (max 2) if any
// appear in narration. Add new offenders here as they surface in renders.
const BANNED_TOKENS = [
  'delve', 'leverage', 'fast-paced world', 'moreover', 'furthermore',
  'unlock', 'harness', 'embark', 'realm', 'tapestry', 'elevate', 'seamless',
  "let's dive in", 'in this video', 'have you ever wondered', 'today we',
]

const POINT_COUNT: Record<VideoTemplate, [number, number]> = {
  TopicExplainer: [3, 4],
  TwitterThread: [4, 6],
  QuickTip: [2, 3],
}

const STYLE_HINT: Record<VideoTemplate, string> = {
  TopicExplainer: 'Format: 45–60s explainer. Energetic but informative.',
  TwitterThread: 'Format: 30s thread. Each point is one tweet — punchy, contrarian, conversational.',
  QuickTip: 'Format: 20s quick tip. Brutally concise; every word earns its spot.',
}

const SYSTEM_PROMPT = `You write short-form vertical video scripts for TikTok / Reels / Shorts.

HARD RULES:
- Open with a pattern interrupt: a question, a contrarian claim, or a specific number/stat. Never "Today...", "In this video...", "Have you ever wondered...", "Let's dive in...".
- Spoken-word voice: contractions, second person ("you"), concrete nouns. Sentences ≤14 words.
- BANNED words/phrases (do not use any form): delve, leverage, fast-paced world, moreover, furthermore, unlock, harness, embark, realm, tapestry, elevate, seamless.
- "onScreen" text is NOT a transcript of the spoken "narration" — it's a kinetic-typography fragment. 2–5 words. Should feel like a punchy chyron, not a subtitle.
- Output STRICT JSON only. No markdown, no preamble.

OUTPUT SCHEMA:
{
  "beats": {
    "hook":   { "narration": "≤14 words, opens the video",       "onScreen": "2–5 word chyron" },
    "points": [ { "narration": "≤18 words", "onScreen": "2–5 words" }, ... ],
    "payoff": { "narration": "≤14 words, the 'so what'",         "onScreen": "2–5 words" },
    "cta":    { "narration": "≤8 words",                         "onScreen": "2–4 words" }
  },
  "keywords": ["3 to 5 single search terms for portrait stock footage"]
}

EXAMPLE (QuickTip — "morning routine"):
{
  "beats": {
    "hook":   { "narration": "Your 5am morning routine is making you worse at your job.", "onScreen": "5AM is a trap" },
    "points": [
      { "narration": "Sleep researchers tracked 1,200 people. Early risers lost 40 minutes of deep sleep.",   "onScreen": "−40 min deep sleep" },
      { "narration": "Deep sleep is when your brain consolidates skills. You're trading expertise for vibes.", "onScreen": "Sleep > grindset" },
      { "narration": "Wake up when YOUR body says to. Then attack the day.",                                  "onScreen": "Listen to your body" }
    ],
    "payoff": { "narration": "Discipline isn't a wakeup time. It's matching effort to biology.",              "onScreen": "Match effort to biology" },
    "cta":    { "narration": "Follow for more sleep science.",                                                "onScreen": "Follow for more" }
  },
  "keywords": ["alarm clock", "tired commuter", "office worker", "bedroom morning", "coffee"]
}

EXAMPLE (TwitterThread — "indie hacker pricing"):
{
  "beats": {
    "hook":   { "narration": "Most indie SaaS dies because the founder priced it like a side project.", "onScreen": "Pricing kills indie SaaS" },
    "points": [
      { "narration": "$9/mo means you need 1,000 paying users to make rent. You won't get there.", "onScreen": "$9 = 1000 users" },
      { "narration": "Charge businesses, not consumers. Same product, 10x the willingness to pay.", "onScreen": "B2B pays 10x" },
      { "narration": "Triple your price tomorrow. The customers you lose weren't customers anyway.", "onScreen": "3x your price" },
      { "narration": "Your job is solving expensive problems, not winning a race to zero.",         "onScreen": "Solve expensive problems" }
    ],
    "payoff": { "narration": "Cheap pricing isn't humble. It's a statement that your work isn't worth much.", "onScreen": "Cheap = self-doubt" },
    "cta":    { "narration": "Follow for indie hacker reality checks.",                                       "onScreen": "Follow for more" }
  },
  "keywords": ["laptop coding", "startup office", "money cash", "graph chart", "coffee shop work"]
}`

function buildScriptPrompt(topic: string, summary: string, template: VideoTemplate): string {
  const [pmin, pmax] = POINT_COUNT[template]
  return [
    `TOPIC: ${topic}`,
    summary ? `RESEARCH NOTES: ${summary}` : '',
    STYLE_HINT[template],
    `Use ${pmin}–${pmax} points.`,
    `Return JSON only.`,
  ].filter(Boolean).join('\n\n')
}

function findBannedToken(text: string): string | null {
  const lower = text.toLowerCase()
  for (const tok of BANNED_TOKENS) {
    if (lower.includes(tok)) return tok
  }
  return null
}

// Reject if onScreen is just a substring/transcript of narration. We measure
// shared-token ratio rather than equality — a chyron should be a different
// phrasing of the same idea, not a copy.
function tooSimilar(narration: string, onScreen: string): boolean {
  const tokens = (s: string) =>
    new Set(s.toLowerCase().split(/\W+/).filter((w) => w.length > 2))
  const a = tokens(narration)
  const b = tokens(onScreen)
  if (b.size === 0) return false
  let shared = 0
  for (const w of b) if (a.has(w)) shared++
  return shared / b.size >= 0.7
}

function validateBeats(beats: Beats, template: VideoTemplate): string | null {
  if (!beats?.hook || !beats?.points?.length || !beats?.payoff || !beats?.cta) {
    return 'missing required beats (hook/points/payoff/cta)'
  }
  const [pmin, pmax] = POINT_COUNT[template]
  if (beats.points.length < pmin || beats.points.length > pmax) {
    return `points count ${beats.points.length} outside [${pmin}, ${pmax}]`
  }
  const allBeats: Beat[] = [beats.hook, ...beats.points, beats.payoff, beats.cta]
  for (const b of allBeats) {
    if (!b?.narration || !b?.onScreen) return 'beat missing narration or onScreen'
    const banned = findBannedToken(b.narration) ?? findBannedToken(b.onScreen)
    if (banned) return `banned token "${banned}"`
    if (tooSimilar(b.narration, b.onScreen)) {
      return `onScreen too similar to narration: "${b.onScreen}"`
    }
  }
  return null
}

function flattenNarration(beats: Beats): string {
  return [beats.hook, ...beats.points, beats.payoff, beats.cta]
    .map((b) => b.narration.trim())
    .join(' ')
}

function deriveLegacyFields(beats: Beats): {
  title: string
  narration: string
  bullets: string[]
  cta: string
} {
  return {
    title: beats.hook.onScreen.slice(0, 60),
    narration: flattenNarration(beats),
    bullets: beats.points.map((p) => p.onScreen.slice(0, 80)),
    cta: beats.cta.onScreen.slice(0, 30),
  }
}

async function generateVideoScript(
  topic: string,
  summary: string,
  template: VideoTemplate,
): Promise<VideoScript> {
  const userPrompt = buildScriptPrompt(topic, summary, template)
  let lastError = ''

  // 1 initial + 2 retries. After that we throw — caller marks the job failed.
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await generateText(userPrompt, {
      system: SYSTEM_PROMPT,
      temperature: 0.8,
      jsonMode: true,
    })
    let parsed: { beats?: Beats; keywords?: string[] }
    try {
      parsed = JSON.parse(extractJSON(raw))
    } catch (err) {
      lastError = `JSON parse failed: ${err instanceof Error ? err.message : err}`
      console.warn(`[video-worker] script attempt ${attempt + 1}: ${lastError}`)
      continue
    }
    const beats = parsed.beats
    if (!beats) {
      lastError = 'response missing "beats"'
      console.warn(`[video-worker] script attempt ${attempt + 1}: ${lastError}`)
      continue
    }
    const issue = validateBeats(beats, template)
    if (issue) {
      lastError = issue
      console.warn(`[video-worker] script attempt ${attempt + 1}: ${issue} — retrying`)
      continue
    }
    const keywords = (parsed.keywords ?? []).filter((k) => typeof k === 'string' && k.trim()).slice(0, 5)
    if (keywords.length === 0) {
      lastError = 'no keywords returned'
      console.warn(`[video-worker] script attempt ${attempt + 1}: ${lastError}`)
      continue
    }
    return { ...deriveLegacyFields(beats), keywords, beats }
  }
  throw new Error(`generateVideoScript exhausted retries: ${lastError}`)
}

// ---------------------------------------------------------------------------
// Step 2: TTS — delegated to the cascade in services/tts
// ---------------------------------------------------------------------------

async function generateAudioBuffer(
  narration: string,
  tmpDir: string,
  template: VideoTemplate,
): Promise<Buffer> {
  return synthesizeTts(narration, { template, tmpDir })
}

// ---------------------------------------------------------------------------
// Step 3: Fetch Pexels stock IMAGES (Remotion renders them via <Img>)
// ---------------------------------------------------------------------------

// Simple in-process cache for Pexels search responses. 24h TTL; restart wipes
// it, which is fine — we just want to dodge the 200 req/hr limit during dev.
const pexelsCache = new Map<string, { at: number; value: MediaItem | null }>()
const PEXELS_TTL_MS = 24 * 60 * 60 * 1000

function cacheGet(key: string): MediaItem | null | undefined {
  const hit = pexelsCache.get(key)
  if (!hit) return undefined
  if (Date.now() - hit.at > PEXELS_TTL_MS) {
    pexelsCache.delete(key)
    return undefined
  }
  return hit.value
}

function cacheSet(key: string, value: MediaItem | null) {
  pexelsCache.set(key, { at: Date.now(), value })
}

// Pick the smallest portrait .mp4 ≥ 720p for fast Chromium decoding. Pexels
// returns multiple `video_files` per video; HD/SD MP4 is what OffthreadVideo
// handles best.
function pickVideoFile(video: PexelsVideo): string | null {
  const mp4s = video.video_files.filter((f) => f.file_type === 'video/mp4')
  if (!mp4s.length) return null
  const portrait = mp4s.filter((f) => f.height >= f.width)
  const candidates = (portrait.length ? portrait : mp4s)
    .filter((f) => f.height >= 720)
    .sort((a, b) => a.height - b.height)
  return (candidates[0] ?? mp4s[0]!).link
}

async function searchPexelsVideo(keyword: string, key: string): Promise<MediaItem | null> {
  const cacheKey = `v:${keyword.toLowerCase()}`
  const cached = cacheGet(cacheKey)
  if (cached !== undefined) return cached
  try {
    const res = await fetch(
      `https://api.pexels.com/videos/search` +
        `?query=${encodeURIComponent(keyword)}&per_page=1&orientation=portrait&size=medium`,
      { headers: { Authorization: key } },
    )
    if (!res.ok) {
      cacheSet(cacheKey, null)
      return null
    }
    const data = (await res.json()) as PexelsVideoResponse
    const video = data.videos[0]
    if (!video) {
      cacheSet(cacheKey, null)
      return null
    }
    const url = pickVideoFile(video)
    if (!url) {
      cacheSet(cacheKey, null)
      return null
    }
    const item: MediaItem = { type: 'video', url, duration: video.duration }
    cacheSet(cacheKey, item)
    return item
  } catch (err) {
    console.warn(`[video-worker] Pexels video search failed for "${keyword}":`, err)
    return null
  }
}

async function searchPexelsImage(keyword: string, key: string): Promise<MediaItem | null> {
  const cacheKey = `i:${keyword.toLowerCase()}`
  const cached = cacheGet(cacheKey)
  if (cached !== undefined) return cached
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search` +
        `?query=${encodeURIComponent(keyword)}&per_page=1&orientation=portrait&size=large`,
      { headers: { Authorization: key } },
    )
    if (!res.ok) {
      cacheSet(cacheKey, null)
      return null
    }
    const data = (await res.json()) as PexelsPhotoResponse
    const photo = data.photos[0]
    if (!photo) {
      cacheSet(cacheKey, null)
      return null
    }
    const url = photo.src.large2x ?? photo.src.large ?? photo.src.original
    const item: MediaItem = { type: 'image', url }
    cacheSet(cacheKey, item)
    return item
  } catch (err) {
    console.warn(`[video-worker] Pexels image search failed for "${keyword}":`, err)
    return null
  }
}

// Prefer videos (Pexels Videos API), fall back to a still image per keyword
// when no portrait video is available. Returns up to 3 typed media items.
async function fetchPexelsMedia(keywords: string[]): Promise<MediaItem[]> {
  const key = process.env.PEXELS_API_KEY
  if (!key) return []
  const out: MediaItem[] = []
  for (const keyword of keywords.slice(0, 5)) {
    if (out.length >= 3) break
    const video = await searchPexelsVideo(keyword, key)
    if (video) {
      out.push(video)
      continue
    }
    const image = await searchPexelsImage(keyword, key)
    if (image) out.push(image)
  }
  return out
}

// ---------------------------------------------------------------------------
// Step 4: Upload audio MP3 to Supabase Storage so Remotion Chromium can fetch
// ---------------------------------------------------------------------------

async function uploadAudio(
  buffer: Buffer,
  projectId: string,
  contentItemId: string,
): Promise<string> {
  const storagePath = `${projectId}/${contentItemId}_narration.mp3`
  const { error } = await supabaseAdmin.storage
    .from('videos')
    .upload(storagePath, buffer, {
      contentType: 'audio/mpeg',
      upsert: true,
    })
  if (error) throw new Error(`Audio upload failed: ${error.message}`)
  const { data } = supabaseAdmin.storage.from('videos').getPublicUrl(storagePath)
  return data.publicUrl
}

async function uploadCaptions(
  captions: WordTiming[],
  projectId: string,
  contentItemId: string,
): Promise<string> {
  const storagePath = `${projectId}/${contentItemId}_captions.json`
  const { error } = await supabaseAdmin.storage
    .from('videos')
    .upload(storagePath, Buffer.from(JSON.stringify(captions)), {
      contentType: 'application/json',
      upsert: true,
    })
  if (error) throw new Error(`Captions upload failed: ${error.message}`)
  const { data } = supabaseAdmin.storage.from('videos').getPublicUrl(storagePath)
  return data.publicUrl
}

// ---------------------------------------------------------------------------
// Step 5: Upload final MP4
// ---------------------------------------------------------------------------

async function uploadVideo(
  localPath: string,
  projectId: string,
  contentItemId: string,
): Promise<string> {
  const storagePath = `${projectId}/${contentItemId}.mp4`
  const fileBuffer = fs.readFileSync(localPath)

  const { error } = await supabaseAdmin.storage
    .from('videos')
    .upload(storagePath, fileBuffer, {
      contentType: 'video/mp4',
      upsert: true,
    })
  if (error) throw new Error(`Video upload failed: ${error.message}`)

  const { data } = supabaseAdmin.storage.from('videos').getPublicUrl(storagePath)
  return data.publicUrl
}

// ---------------------------------------------------------------------------
// Main worker function
// ---------------------------------------------------------------------------

async function processVideoJob(job: Job<VideoJobData>) {
  const {
    project_id,
    research_result_id,
    content_item_id,
    topic,
    template,
  } = job.data
  const tmpDir = path.join(os.tmpdir(), `ce_video_${job.id}`)
  fs.mkdirSync(tmpDir, { recursive: true })

  console.log(
    `[video-worker] Starting job ${job.id} — topic: "${topic}" template: ${template}`,
  )

  try {
    // ── Step 1: Script ───────────────────────────────────────────────────
    await setStep(content_item_id, 'generating_script')
    await job.updateProgress(10)

    const { data: research } = await supabaseAdmin
      .from('research_results')
      .select('summary')
      .eq('id', research_result_id)
      .single()

    const script = await generateVideoScript(
      topic,
      research?.summary ?? '',
      template,
    )
    await job.updateProgress(25)

    // ── Step 2: TTS ──────────────────────────────────────────────────────
    await setStep(content_item_id, 'creating_voiceover')
    const audioBuffer = await generateAudioBuffer(script.narration, tmpDir, template)
    const audioUrl = await uploadAudio(audioBuffer, project_id, content_item_id)
    await job.updateProgress(40)

    // ── Step 2b: Captions (whisper word-level) ───────────────────────────
    // Soft-fail: if whisper isn't installed or model download fails, render
    // continues without captions rather than dropping the whole job.
    await setStep(content_item_id, 'generating_captions')
    let captions: WordTiming[] = []
    try {
      captions = await transcribeWords(audioBuffer)
      if (captions.length) {
        await uploadCaptions(captions, project_id, content_item_id)
        console.log(`[video-worker] captions: ${captions.length} words`)
      } else {
        console.warn('[video-worker] captions: whisper returned 0 words')
      }
    } catch (err) {
      console.warn('[video-worker] captions skipped:', err instanceof Error ? err.message : err)
    }
    await job.updateProgress(50)

    // ── Step 3: Pexels media (videos preferred, images fallback) ─────────
    await setStep(content_item_id, 'fetching_footage')
    const mediaItems = await fetchPexelsMedia(script.keywords)
    // Legacy `images` prop: still images only, for compositions that haven't
    // migrated to mediaItems yet.
    const images = mediaItems.filter((m) => m.type === 'image').map((m) => m.url)
    await job.updateProgress(55)

    // ── Step 4: Render with Remotion ─────────────────────────────────────
    await setStep(content_item_id, 'rendering')

    const serveUrl = await getServeUrl()
    const inputProps = {
      title: script.title,
      content: script.bullets,
      images,
      brandColor: '#6366f1',
      audioUrl,
      cta: script.cta || 'Follow for more',
      beats: script.beats,
      captions: captions.length ? captions : undefined,
      mediaItems: mediaItems.length ? mediaItems : undefined,
    }

    const composition = await selectComposition({
      serveUrl,
      id: template,
      inputProps,
      timeoutInMilliseconds: 90_000,
      chromiumOptions: { gl: 'angle' },
    })

    const outputPath = path.join(tmpDir, 'output.mp4')

    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      outputLocation: outputPath,
      inputProps,
      timeoutInMilliseconds: 90_000,
      chromiumOptions: { gl: 'angle' },
      onProgress: ({ progress }) => {
        const pct = Math.min(90, 55 + Math.floor(progress * 35))
        job.updateProgress(pct).catch(() => {})
      },
    })

    await job.updateProgress(92)

    // ── Step 5: Upload ───────────────────────────────────────────────────
    const publicUrl = await uploadVideo(outputPath, project_id, content_item_id)
    await job.updateProgress(97)

    // ── Step 6: Mark done ────────────────────────────────────────────────
    await supabaseAdmin
      .from('content_items')
      .update({
        status: 'done',
        progress_step: 'done',
        content: script.narration,
        title: script.title,
        output_url: publicUrl,
      })
      .eq('id', content_item_id)

    await job.updateProgress(100)
    console.log(`[video-worker] Job ${job.id} complete — ${publicUrl}`)
    return { output_url: publicUrl }
  } catch (err) {
    console.error(`[video-worker] Job ${job.id} failed:`, err)
    await supabaseAdmin
      .from('content_items')
      .update({ status: 'failed', progress_step: 'failed' })
      .eq('id', content_item_id)
    throw err
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {}
  }
}

// ---------------------------------------------------------------------------
// Export worker
// ---------------------------------------------------------------------------

export const videoWorker = new Worker<VideoJobData>(
  'video',
  async (job) => {
    await warmup
    return processVideoJob(job)
  },
  {
    connection: makeRedisConnection(),
    concurrency: 1,
    // Bumped from 120s to handle whisper model first-run download (~150MB
    // for base.en) plus transcription of up to ~60s narration. Renormal
    // jobs re-extend the lock automatically.
    lockDuration: 300_000,
    stalledInterval: 60_000,
  },
)

videoWorker.on('completed', (job) => {
  console.log(`[video-worker] Job ${job.id} completed`)
})

videoWorker.on('failed', (job, err) => {
  console.error(`[video-worker] Job ${job?.id} failed:`, err.message)
})

videoWorker.on('error', (err) => {
  console.error('[video-worker] Worker error:', err)
})

const shutdown = async () => {
  try {
    await videoWorker.close()
  } catch {}
}
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
