import { Worker, type Job } from 'bullmq'
import { supabaseAdmin } from '../services/supabase'
import { generateText } from '../lib/llm'
import { makeRedisConnection, type ResearchJobData } from '../services/queue'

interface ResearchTopic {
  title: string
  summary: string
  platform: string
  engagement_level: 'high' | 'medium' | 'low'
  content_angles: string[]
}

// Strip markdown code fences that Claude sometimes adds despite instructions
function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  return fenced ? fenced[1].trim() : text.trim()
}

async function processResearchJob(job: Job<ResearchJobData>) {
  const { project_id, niche } = job.data

  console.log(`[research-worker] Starting job ${job.id} — project ${project_id}, niche: "${niche}"`)
  await job.updateProgress(10)

  // Call LLM
  const prompt =
    `Find the top 10 trending topics in ${niche} from the past 7 days across Reddit, X/Twitter, YouTube, Hacker News, and the web. ` +
    `For each topic return JSON: {"title": string, "summary": string, "platform": string, "engagement_level": "high"|"medium"|"low", "content_angles": string[]}. ` +
    `Return ONLY valid JSON array, no markdown.`

  const rawText = await generateText(prompt)

  await job.updateProgress(50)

  const jsonText = extractJSON(rawText)

  let topics: ResearchTopic[]
  try {
    const parsed = JSON.parse(jsonText)
    if (!Array.isArray(parsed)) throw new Error('Response is not a JSON array')
    topics = parsed
  } catch (err) {
    console.error(`[research-worker] JSON parse failed for job ${job.id}:`, err)
    console.error('Raw response:', rawText.slice(0, 500))
    throw new Error(`Failed to parse LLM response as JSON: ${err instanceof Error ? err.message : String(err)}`)
  }

  await job.updateProgress(60)

  // Insert each topic into research_results
  const rows = topics.map((topic) => ({
    project_id,
    platform: topic.platform?.toLowerCase() ?? 'web',
    topic: topic.title,
    summary: topic.summary,
    raw_data: {
      engagement_level: topic.engagement_level,
      content_angles: Array.isArray(topic.content_angles) ? topic.content_angles : [],
    },
  }))

  const { error } = await supabaseAdmin.from('research_results').insert(rows)

  if (error) {
    console.error(`[research-worker] Supabase insert failed for job ${job.id}:`, error)
    throw new Error(`Database insert failed: ${error.message}`)
  }

  await job.updateProgress(100)
  console.log(`[research-worker] Job ${job.id} completed — inserted ${rows.length} results`)

  return { inserted: rows.length }
}

export const researchWorker = new Worker<ResearchJobData>(
  'research',
  processResearchJob,
  {
    connection: makeRedisConnection(),
    concurrency: 3,
  }
)

researchWorker.on('completed', (job) => {
  console.log(`[research-worker] Job ${job.id} completed`)
})

researchWorker.on('failed', (job, err) => {
  console.error(`[research-worker] Job ${job?.id} failed:`, err.message)
})

researchWorker.on('error', (err) => {
  console.error('[research-worker] Worker error:', err)
})
