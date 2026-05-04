import { createClient } from './supabase/client'
import type { Project, ResearchResult, ContentItem } from '@contentengine/shared'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {}),
      ...init?.headers,
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Request failed: ${res.status}`)
  }

  return res.json() as Promise<T>
}

export const projectsApi = {
  list: () => apiFetch<Project[]>('/projects'),
  get: (id: string) =>
    apiFetch<Project & { _count: { research_results: number; content_items: number } }>(
      `/projects/${id}`
    ),
  create: (body: { name: string; niche: string }) =>
    apiFetch<Project>('/projects', { method: 'POST', body: JSON.stringify(body) }),
  delete: (id: string) => apiFetch(`/projects/${id}`, { method: 'DELETE' }),
}

export const researchApi = {
  trigger: (projectId: string) =>
    apiFetch<{ job_id: string; status: string }>(`/projects/${projectId}/research`, {
      method: 'POST',
    }),
  list: (projectId: string) =>
    apiFetch<ResearchResult[]>(`/projects/${projectId}/research`),
}

export const contentApi = {
  generate: (projectId: string, topicId: string) =>
    apiFetch<{ job_id: string; status: string; usage: { used: number; limit: number; plan: string } }>(
      `/projects/${projectId}/content`,
      { method: 'POST', body: JSON.stringify({ topic_id: topicId }) }
    ),
  list: (projectId: string) =>
    apiFetch<ContentItem[]>(`/projects/${projectId}/content`),
  usage: (projectId: string) =>
    apiFetch<{ used: number; limit: number; plan: string }>(`/projects/${projectId}/content/usage`),
}

export type VideoTemplate = 'TopicExplainer' | 'TwitterThread' | 'QuickTip'

export const VIDEO_TEMPLATES: { value: VideoTemplate; label: string }[] = [
  { value: 'TopicExplainer', label: 'Topic Explainer (60s)' },
  { value: 'TwitterThread', label: 'Twitter Thread (30s)' },
  { value: 'QuickTip', label: 'Quick Tip (20s)' },
]

export const videoApi = {
  generate: (projectId: string, topicId: string, template: VideoTemplate) =>
    apiFetch<{ job_id: string; content_item_id: string; status: string }>(
      `/projects/${projectId}/video`,
      {
        method: 'POST',
        body: JSON.stringify({ topic_id: topicId, template }),
      }
    ),
}
