'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { contentApi, videoApi, VIDEO_TEMPLATES, type VideoTemplate } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { ContentItem, ResearchResult } from '@contentengine/shared'

type Platform = 'twitter' | 'linkedin' | 'instagram' | 'blog' | 'video'

const PLATFORMS: { key: Platform; label: string }[] = [
  { key: 'twitter', label: 'Twitter' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'blog', label: 'Blog' },
  { key: 'video', label: 'Video' },
]

const STATUS_STYLES: Record<string, string> = {
  queued: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  done: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
}

const PROGRESS_LABELS: Record<string, string> = {
  queued: 'Queued…',
  generating_script: 'Generating script…',
  creating_voiceover: 'Creating voiceover…',
  fetching_footage: 'Fetching stock footage…',
  rendering: 'Rendering video…',
  done: 'Done',
  failed: 'Failed',
}

interface Props {
  projectId: string
  initialItems: ContentItem[]
  researchResults: ResearchResult[]
  initialUsage: { used: number; limit: number; plan: string }
}

export function ContentSection({ projectId, initialItems, researchResults, initialUsage }: Props) {
  const [items, setItems] = useState<ContentItem[]>(initialItems)
  const [activeTab, setActiveTab] = useState<Platform>('twitter')
  const [generatingContent, setGeneratingContent] = useState<Set<string>>(new Set())
  const [generatingVideo, setGeneratingVideo] = useState<Set<string>>(new Set())
  const [videoTemplates, setVideoTemplates] = useState<Record<string, VideoTemplate>>({})
  const [error, setError] = useState<string | null>(null)
  const [usage, setUsage] = useState(initialUsage)
  const [copied, setCopied] = useState<string | null>(null)

  const isProOrAgency = usage.plan === 'pro' || usage.plan === 'agency'

  // Subscribe to Realtime for content_items
  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel(`content:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'content_items',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newItem = payload.new as ContentItem
            setItems((prev) => {
              if (prev.some((i) => i.id === newItem.id)) return prev
              return [newItem, ...prev]
            })
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as ContentItem
            setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))

            if (updated.status === 'done' || updated.status === 'failed') {
              if (updated.research_result_id) {
                setGeneratingContent((prev) => {
                  const next = new Set(prev)
                  next.delete(updated.research_result_id!)
                  return next
                })
                if (updated.type === 'video') {
                  setGeneratingVideo((prev) => {
                    const next = new Set(prev)
                    next.delete(updated.research_result_id!)
                    return next
                  })
                }
              }
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [projectId])

  async function handleGenerate(topicId: string) {
    setError(null)
    setGeneratingContent((prev) => new Set(prev).add(topicId))
    try {
      const result = await contentApi.generate(projectId, topicId)
      if (result.usage) setUsage(result.usage)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate content')
      setGeneratingContent((prev) => {
        const next = new Set(prev)
        next.delete(topicId)
        return next
      })
    }
  }

  async function handleGenerateVideo(topicId: string) {
    setError(null)
    setGeneratingVideo((prev) => new Set(prev).add(topicId))
    const template = videoTemplates[topicId] ?? 'TopicExplainer'
    try {
      await videoApi.generate(projectId, topicId, template)
      // Remove from set when Realtime fires done/failed
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start video generation')
      setGeneratingVideo((prev) => {
        const next = new Set(prev)
        next.delete(topicId)
        return next
      })
    }
  }

  async function handleCopy(id: string, content: string) {
    await navigator.clipboard.writeText(content)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const tabItems = items.filter((i) => i.platform === activeTab)

  const usageLabel =
    usage.limit === -1
      ? `${usage.used} generations used (unlimited)`
      : `${usage.used} / ${usage.limit} generations used this month`

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Content</CardTitle>
            <CardDescription>Generated posts and articles from research topics</CardDescription>
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap pt-1">{usageLabel}</span>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        {/* Per-result generate buttons */}
        {researchResults.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Generate from research topics:</p>
            <div className="flex flex-col gap-2">
              {researchResults.map((result) => {
                const isContentPending = generatingContent.has(result.id)
                const isVideoPending = generatingVideo.has(result.id)
                const hasContent = items.some(
                  (i) => i.research_result_id === result.id && i.type !== 'video'
                )
                const hasVideo = items.some(
                  (i) => i.research_result_id === result.id && i.type === 'video'
                )
                const atLimit = usage.limit !== -1 && usage.used >= usage.limit

                return (
                  <div
                    key={result.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2 gap-3"
                  >
                    <span className="text-sm truncate flex-1">{result.topic}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Content button */}
                      <Button
                        size="sm"
                        variant={hasContent ? 'outline' : 'default'}
                        onClick={() => handleGenerate(result.id)}
                        disabled={isContentPending || atLimit}
                      >
                        {isContentPending ? (
                          <span className="flex items-center gap-2">
                            <Spinner /> Generating…
                          </span>
                        ) : hasContent ? (
                          'Regenerate'
                        ) : (
                          'Generate Content'
                        )}
                      </Button>

                      {/* Video controls — pro/agency only */}
                      {isProOrAgency ? (
                        <>
                          <select
                            value={videoTemplates[result.id] ?? 'TopicExplainer'}
                            onChange={(e) =>
                              setVideoTemplates((prev) => ({
                                ...prev,
                                [result.id]: e.target.value as VideoTemplate,
                              }))
                            }
                            disabled={isVideoPending}
                            className="h-8 rounded-md border bg-background px-2 text-xs"
                          >
                            {VIDEO_TEMPLATES.map((t) => (
                              <option key={t.value} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                          <Button
                            size="sm"
                            variant={hasVideo ? 'outline' : 'secondary'}
                            onClick={() => handleGenerateVideo(result.id)}
                            disabled={isVideoPending}
                          >
                            {isVideoPending ? (
                              <span className="flex items-center gap-2">
                                <Spinner /> Rendering…
                              </span>
                            ) : hasVideo ? (
                              'Remake Video'
                            ) : (
                              'Generate Video'
                            )}
                          </Button>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">Video: Pro+</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {items.length === 0 ? (
          <div className="flex h-24 items-center justify-center rounded-md border border-dashed">
            <p className="text-sm text-muted-foreground">
              No content yet. Click "Generate Content" on a research topic above.
            </p>
          </div>
        ) : (
          <>
            {/* Platform tabs */}
            <div className="flex gap-1 border-b overflow-x-auto">
              {PLATFORMS.map(({ key, label }) => {
                const count = items.filter((i) => i.platform === key).length
                return (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                      activeTab === key
                        ? 'border-primary text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {label}
                    {count > 0 && (
                      <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs">
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Tab content */}
            <div className="space-y-4">
              {tabItems.length === 0 ? (
                <div className="flex h-16 items-center justify-center rounded-md border border-dashed">
                  <p className="text-sm text-muted-foreground">No {activeTab} content yet.</p>
                </div>
              ) : activeTab === 'video' ? (
                tabItems.map((item) => (
                  <VideoCard key={item.id} item={item} />
                ))
              ) : (
                tabItems.map((item) => (
                  <ContentCard
                    key={item.id}
                    item={item}
                    isCopied={copied === item.id}
                    onCopy={() => handleCopy(item.id, item.content)}
                  />
                ))
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Text content card
// ---------------------------------------------------------------------------

function ContentCard({
  item,
  isCopied,
  onCopy,
}: {
  item: ContentItem
  isCopied: boolean
  onCopy: () => void
}) {
  const statusStyle = STATUS_STYLES[item.status] ?? STATUS_STYLES.queued

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-tight line-clamp-1">{item.title}</p>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusStyle}`}
          >
            {item.status}
          </span>
          {item.status === 'done' && item.content && (
            <Button size="sm" variant="outline" onClick={onCopy} className="h-7 text-xs">
              {isCopied ? 'Copied!' : 'Copy'}
            </Button>
          )}
        </div>
      </div>

      {item.status === 'processing' && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="text-primary" />
          <span>Generating…</span>
        </div>
      )}

      {item.status === 'done' && item.content && (
        <pre className="whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed font-sans">
          {item.content}
        </pre>
      )}

      {item.status === 'failed' && (
        <p className="text-sm text-destructive">Generation failed. Try regenerating.</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Video card
// ---------------------------------------------------------------------------

function VideoCard({ item }: { item: ContentItem }) {
  const stepLabel =
    item.status === 'processing'
      ? (PROGRESS_LABELS[item.progress_step ?? 'queued'] ?? 'Processing…')
      : item.status

  const progressPercent = (() => {
    const steps = ['queued', 'generating_script', 'creating_voiceover', 'fetching_footage', 'rendering', 'done']
    const idx = steps.indexOf(item.progress_step ?? 'queued')
    return idx >= 0 ? Math.round((idx / (steps.length - 1)) * 100) : 0
  })()

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-tight">{item.title}</p>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold flex-shrink-0 ${
            STATUS_STYLES[item.status] ?? STATUS_STYLES.queued
          }`}
        >
          {item.status}
        </span>
      </div>

      {/* Progress steps */}
      {item.status === 'processing' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="text-primary flex-shrink-0" />
            <span>{stepLabel}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-700"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            {['Script', 'Voice', 'Footage', 'Render'].map((s) => (
              <span key={s}>{s}</span>
            ))}
          </div>
        </div>
      )}

      {/* Done: video player */}
      {item.status === 'done' && item.output_url && (
        <div className="space-y-2">
          <video
            src={item.output_url}
            controls
            playsInline
            className="w-full max-h-96 rounded-md bg-black object-contain"
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" asChild>
              <a href={item.output_url} download={`${item.title}.mp4`} target="_blank" rel="noopener noreferrer">
                Download MP4
              </a>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigator.clipboard.writeText(item.output_url!)}
            >
              Copy URL
            </Button>
          </div>
        </div>
      )}

      {item.status === 'failed' && (
        <p className="text-sm text-destructive">Video generation failed. Try regenerating.</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={`h-4 w-4 animate-spin ${className ?? ''}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}
