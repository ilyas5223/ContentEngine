import { Worker, type Job } from 'bullmq'
import { supabaseAdmin } from '../services/supabase'
import { generateText } from '../lib/llm'
import { makeRedisConnection, type ContentJobData } from '../services/queue'

interface GeneratedContent {
  twitter_thread: string[]
  linkedin: string
  instagram: string
  blog: string
}

// Strip markdown code fences that Claude sometimes adds
function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  return fenced ? fenced[1].trim() : text.trim()
}

async function processContentJob(job: Job<ContentJobData>) {
  const { project_id, research_result_id, user_id } = job.data

  console.log(`[content-worker] Starting job ${job.id} — project ${project_id}, result ${research_result_id}`)
  await job.updateProgress(10)

  // Fetch the research result
  const { data: result, error: fetchError } = await supabaseAdmin
    .from('research_results')
    .select('topic, summary')
    .eq('id', research_result_id)
    .single()

  if (fetchError || !result) {
    throw new Error(`Research result not found: ${research_result_id}`)
  }

  await job.updateProgress(20)

  // Insert 4 placeholder rows (status: 'processing') so Realtime fires immediately
  const placeholders = [
    { platform: 'twitter', title: `Twitter Thread: ${result.topic}` },
    { platform: 'linkedin', title: `LinkedIn Post: ${result.topic}` },
    { platform: 'instagram', title: `Instagram Caption: ${result.topic}` },
    { platform: 'blog', title: `Blog Post: ${result.topic}` },
  ].map((p) => ({
    project_id,
    research_result_id,
    type: p.platform === 'blog' ? 'article' : 'post',
    platform: p.platform,
    title: p.title,
    content: '',
    status: 'processing',
    output_url: null,
  }))

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('content_items')
    .insert(placeholders)
    .select('id, platform')

  if (insertError || !inserted) {
    throw new Error(`Failed to insert placeholder rows: ${insertError?.message}`)
  }

  await job.updateProgress(30)

  // Build a map of platform → id for later update
  const idByPlatform: Record<string, string> = {}
  for (const row of inserted) {
    idByPlatform[row.platform] = row.id
  }

  // Call LLM — social media content expert persona
  const prompt =
    `You are a social media content expert. Given this trending topic: "${result.topic}" - ${result.summary}. ` +
    `Generate: ` +
    `1) Twitter/X thread (5-7 tweets with hooks — start with a compelling question or bold claim, deliver value in each tweet), ` +
    `2) LinkedIn post (professional tone, insight-driven, 150-200 words with a clear takeaway), ` +
    `3) Instagram caption (casual, visual storytelling, 3-4 sentences + 8-10 relevant hashtags), ` +
    `4) Short blog post (300 words, SEO-friendly title baked in, clear intro/body/conclusion). ` +
    `Return ONLY valid JSON — no markdown, no extra text: ` +
    `{"twitter_thread": string[], "linkedin": string, "instagram": string, "blog": string}`

  const rawText = await generateText(prompt)

  await job.updateProgress(70)

  const jsonText = extractJSON(rawText)

  let generated: GeneratedContent
  try {
    generated = JSON.parse(jsonText)
    if (!generated.twitter_thread || !generated.linkedin || !generated.instagram || !generated.blog) {
      throw new Error('Missing required fields in response')
    }
  } catch (err) {
    console.error(`[content-worker] JSON parse failed for job ${job.id}:`, err)
    // Mark all as failed
    await supabaseAdmin
      .from('content_items')
      .update({ status: 'failed' })
      .in('id', Object.values(idByPlatform))
    throw new Error(`Failed to parse LLM response: ${err instanceof Error ? err.message : String(err)}`)
  }

  await job.updateProgress(80)

  // Update each row with generated content
  const twitterContent = Array.isArray(generated.twitter_thread)
    ? generated.twitter_thread.join('\n\n---\n\n')
    : String(generated.twitter_thread)

  const updates = [
    { id: idByPlatform['twitter'], content: twitterContent, status: 'done' },
    { id: idByPlatform['linkedin'], content: generated.linkedin, status: 'done' },
    { id: idByPlatform['instagram'], content: generated.instagram, status: 'done' },
    { id: idByPlatform['blog'], content: generated.blog, status: 'done' },
  ]

  for (const update of updates) {
    await supabaseAdmin
      .from('content_items')
      .update({ content: update.content, status: update.status })
      .eq('id', update.id)
  }

  await job.updateProgress(100)
  console.log(`[content-worker] Job ${job.id} completed — 4 content items generated`)

  return { generated: 4 }
}

export const contentWorker = new Worker<ContentJobData>(
  'content',
  processContentJob,
  {
    connection: makeRedisConnection(),
    concurrency: 2,
  }
)

contentWorker.on('completed', (job) => {
  console.log(`[content-worker] Job ${job.id} completed`)
})

contentWorker.on('failed', (job, err) => {
  console.error(`[content-worker] Job ${job?.id} failed:`, err.message)
})

contentWorker.on('error', (err) => {
  console.error('[content-worker] Worker error:', err)
})
