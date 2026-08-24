import path from 'path'
import fs from 'fs'
import os from 'os'
import { Worker, type Job } from 'bullmq'
import { supabaseAdmin } from '../services/supabase'
import { synthesize as synthesizeTts } from '../services/tts'
import { transcribeWords, type WordTiming } from '../services/captions'
import { generateVideoScript } from '../services/script'
import { fetchPexelsMedia } from '../services/pexels'
import { closeRenderer, renderVideo, warmupRenderer } from '../services/render'
import {
  makeRedisConnection,
  type VideoJobData,
  type VideoTemplate,
} from '../services/queue'

// Warm up Chrome + the Remotion bundle before the worker accepts jobs.
const warmup = warmupRenderer()
  .then(() => console.log('[video-worker] warmup complete'))
  .catch((err) => {
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
// TTS — delegated to the cascade in services/tts
// ---------------------------------------------------------------------------

async function generateAudioBuffer(
  narration: string,
  tmpDir: string,
  template: VideoTemplate,
): Promise<Buffer> {
  return synthesizeTts(narration, { template, tmpDir })
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

    const outputPath = path.join(tmpDir, 'output.mp4')

    await renderVideo({
      template,
      inputProps,
      outputPath,
      onProgress: (progress) => {
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
    // First-run cost is dominated by one-time downloads: Kokoro 82M ONNX,
    // whisper model + cmake build, Remotion Chromium. 15min buys headroom
    // even on cold starts; the lock auto-extends every 30s while alive.
    lockDuration: 900_000,
    stalledInterval: 120_000,
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
  try {
    await closeRenderer()
  } catch {}
}
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
