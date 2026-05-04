// User types
export type Plan = 'free' | 'pro' | 'agency'

export interface User {
  id: string
  email: string
  full_name: string | null
  plan: Plan
  created_at: string
}

// Project types
export type ProjectStatus = 'active' | 'archived'

export interface Project {
  id: string
  user_id: string
  name: string
  niche: string
  status: ProjectStatus
  created_at: string
}

// Research types
export type Platform = 'youtube' | 'reddit' | 'twitter' | 'tiktok' | 'google'

export interface ResearchResult {
  id: string
  project_id: string
  platform: Platform
  topic: string
  summary: string
  raw_data: Record<string, unknown>
  created_at: string
}

// Content types
export type ContentType = 'video' | 'post' | 'article'
export type ContentStatus = 'queued' | 'processing' | 'done' | 'failed'

export interface ContentItem {
  id: string
  project_id: string
  research_result_id: string | null
  type: ContentType
  platform: string | null
  title: string
  content: string
  status: ContentStatus
  progress_step: string | null
  output_url: string | null
  created_at: string
}
