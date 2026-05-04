import { Queue } from 'bullmq'
import IORedis from 'ioredis'

if (!process.env.REDIS_URL) {
  throw new Error('Missing REDIS_URL')
}

// BullMQ requires separate IORedis connections per queue/worker
export function makeRedisConnection() {
  return new IORedis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  })
}

export interface ResearchJobData {
  project_id: string
  niche: string
  user_id: string
}

export interface ContentJobData {
  project_id: string
  research_result_id: string
  content_type: 'video' | 'post' | 'article'
  user_id: string
}

export type VideoTemplate = 'TopicExplainer' | 'TwitterThread' | 'QuickTip'

export interface VideoJobData {
  project_id: string
  research_result_id: string
  content_item_id: string
  topic: string
  user_id: string
  template: VideoTemplate
}

const QUEUE_DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 50 },
}

export const researchQueue = new Queue<ResearchJobData>('research', {
  connection: makeRedisConnection(),
  defaultJobOptions: QUEUE_DEFAULTS,
})

export const contentQueue = new Queue<ContentJobData>('content', {
  connection: makeRedisConnection(),
  defaultJobOptions: QUEUE_DEFAULTS,
})

export const videoQueue = new Queue<VideoJobData>('video', {
  connection: makeRedisConnection(),
  defaultJobOptions: {
    ...QUEUE_DEFAULTS,
    attempts: 2, // video jobs are expensive — fewer retries
  },
})
