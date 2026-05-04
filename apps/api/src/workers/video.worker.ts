import path from 'path'
import fs from 'fs'
import os from 'os'
import https from 'https'
import http from 'http'
import { Worker, type Job } from 'bullmq'
import { bundle } from '@remotion/bundler'
import { selectComposition, renderMedia, ensureBrowser } from '@remotion/renderer'
import { supabaseAdmin } from '../services/supabase'
import { generateText } from '../lib/llm'
import {
  makeRedisConnection,
  type VideoJobData,
  type VideoTemplate,
} from '../services/queue'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VideoScript {
  title: string
  narration: string
  bullets: string[]
  keywords: string[]
  cta: string
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

async function generateVideoScript(
  topic: string,
  summary: string,
  template: VideoTemplate,
): Promise<VideoScript> {
  const styleHints: Record<VideoTemplate, string> = {
    TopicExplainer:
      'Format: 60-second explainer. 3 bullet takeaways. Energetic, informative tone.',
    TwitterThread:
      'Format: 30-second Twitter-thread style. 4-6 short punchy tweets (1 sentence each) in "bullets". Conversational tone.',
    QuickTip:
      'Format: 20-second quick tip. 2-3 ultra-concise bullet insights. Punchy and direct.',
  }

  const prompt =
    `You are a short-form video content creator. Topic: "${topic}". ` +
    `Context: ${summary}. ${styleHints[template]} ` +
    `Return ONLY valid JSON, no markdown: ` +
    `{"title": string (<=60 chars), ` +
    `"narration": string (the spoken voiceover text, ~100-150 words, natural and flowing), ` +
    `"bullets": string[] (visible on-screen key points - short fragments, max 80 chars each), ` +
    `"keywords": string[] (3-5 single search terms for stock imagery), ` +
    `"cta": string (short call to action, <=30 chars, e.g. "Follow for more")}`

  const raw = await generateText(prompt)
  const script = JSON.parse(extractJSON(raw)) as VideoScript

  if (!script.narration || !script.bullets?.length || !script.keywords?.length) {
    throw new Error('Invalid script structure from LLM')
  }

  return script
}

// ---------------------------------------------------------------------------
// Step 2: TTS — Google Translate TTS (free), ElevenLabs fallback
// ---------------------------------------------------------------------------

function downloadUrl(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http
    const file = fs.createWriteStream(destPath)
    proto
      .get(
        url,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (compatible; ContentEngine/1.0)',
          },
        },
        (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            file.close()
            downloadUrl(res.headers.location!, destPath).then(resolve).catch(reject)
            return
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} for ${url}`))
            return
          }
          res.pipe(file)
          file.on('finish', () => {
            file.close()
            resolve()
          })
          file.on('error', reject)
        },
      )
      .on('error', reject)
  })
}

async function googleTTSChunks(text: string, tmpDir: string): Promise<string[]> {
  const sentences = text.match(/[^.!?]+[.!?]*/g) ?? [text]
  const chunks: string[] = []
  let current = ''

  for (const s of sentences) {
    const candidate = current ? current + ' ' + s : s
    if (candidate.length > 190) {
      if (current) chunks.push(current.trim())
      current = s.length > 190 ? s.slice(0, 190) : s
    } else {
      current = candidate
    }
  }
  if (current.trim()) chunks.push(current.trim())
  if (chunks.length === 0) chunks.push(text.slice(0, 190))

  const paths: string[] = []
  for (let i = 0; i < chunks.length; i++) {
    const dest = path.join(tmpDir, `tts_chunk_${i}.mp3`)
    const url =
      `https://translate.google.com/translate_tts` +
      `?ie=UTF-8&q=${encodeURIComponent(chunks[i])}&tl=en&client=tw-ob&ttsspeed=0.9`
    await downloadUrl(url, dest)
    paths.push(dest)
  }
  return paths
}

function concatMp3Buffers(paths: string[]): Buffer {
  // MP3 frames can be safely concatenated at the byte level for downstream
  // consumption by Chromium's media decoder. Remotion handles this fine.
  const buffers = paths.map((p) => fs.readFileSync(p))
  return Buffer.concat(buffers)
}

async function generateAudioBuffer(
  narration: string,
  tmpDir: string,
): Promise<Buffer> {
  if (process.env.ELEVENLABS_API_KEY) {
    try {
      const { ElevenLabsClient } = (await import(
        'elevenlabs' as string
      )) as any
      const client = new ElevenLabsClient({
        apiKey: process.env.ELEVENLABS_API_KEY,
      })
      const audioStream = await client.generate({
        voice: 'Rachel',
        model_id: 'eleven_multilingual_v2',
        text: narration,
      })
      const outPath = path.join(tmpDir, 'narration_eleven.mp3')
      const writeStream = fs.createWriteStream(outPath)
      await new Promise<void>((resolve, reject) => {
        audioStream.pipe(writeStream)
        writeStream.on('finish', resolve)
        writeStream.on('error', reject)
      })
      return fs.readFileSync(outPath)
    } catch (err) {
      console.warn('[video-worker] ElevenLabs failed, falling back to Google TTS:', err)
    }
  }

  const chunks = await googleTTSChunks(narration, tmpDir)
  return concatMp3Buffers(chunks)
}

// ---------------------------------------------------------------------------
// Step 3: Fetch Pexels stock IMAGES (Remotion renders them via <Img>)
// ---------------------------------------------------------------------------

async function fetchPexelsImages(keywords: string[]): Promise<string[]> {
  const key = process.env.PEXELS_API_KEY
  if (!key) return []

  const urls: string[] = []

  for (const keyword of keywords.slice(0, 5)) {
    if (urls.length >= 3) break
    try {
      const res = await fetch(
        `https://api.pexels.com/v1/search` +
          `?query=${encodeURIComponent(keyword)}&per_page=1&orientation=portrait&size=large`,
        { headers: { Authorization: key } },
      )
      if (!res.ok) continue
      const data = (await res.json()) as PexelsPhotoResponse
      const photo = data.photos[0]
      if (photo) urls.push(photo.src.large2x ?? photo.src.large ?? photo.src.original)
    } catch (err) {
      console.warn(`[video-worker] Pexels image search failed for "${keyword}":`, err)
    }
  }

  return urls
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
    const audioBuffer = await generateAudioBuffer(script.narration, tmpDir)
    const audioUrl = await uploadAudio(audioBuffer, project_id, content_item_id)
    await job.updateProgress(45)

    // ── Step 3: Pexels images ────────────────────────────────────────────
    await setStep(content_item_id, 'fetching_footage')
    const images = await fetchPexelsImages(script.keywords)
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
    lockDuration: 120_000,
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
