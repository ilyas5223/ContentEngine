'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { researchApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { ResearchResult } from '@contentengine/shared'

interface RawData {
  engagement_level: 'high' | 'medium' | 'low'
  content_angles: string[]
}

interface Props {
  projectId: string
  initialResults: ResearchResult[]
}

const PLATFORM_STYLES: Record<string, string> = {
  reddit: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  youtube: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  'x/twitter': 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-300',
  x: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-300',
  twitter: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-300',
  hackernews: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
  'hacker news': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
  web: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  tiktok: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300',
}

const ENGAGEMENT_STYLES: Record<string, string> = {
  high: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  low: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

function platformStyle(platform: string) {
  return PLATFORM_STYLES[platform.toLowerCase()] ?? PLATFORM_STYLES.web
}

function engagementStyle(level: string) {
  return ENGAGEMENT_STYLES[level?.toLowerCase()] ?? ENGAGEMENT_STYLES.low
}

export function ResearchSection({ projectId, initialResults }: Props) {
  const [results, setResults] = useState<ResearchResult[]>(initialResults)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Subscribe to Realtime inserts for this project
  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel(`research:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'research_results',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const newResult = payload.new as ResearchResult
          setResults((prev) => {
            // Avoid duplicates (in case SSR already has it)
            if (prev.some((r) => r.id === newResult.id)) return prev
            return [newResult, ...prev]
          })
          setPending(false)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [projectId])

  async function handleResearch() {
    setError(null)
    setPending(true)
    try {
      await researchApi.trigger(projectId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start research')
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Research</CardTitle>
            <CardDescription>Trending topics and platform insights</CardDescription>
          </div>
          <Button size="sm" onClick={handleResearch} disabled={pending}>
            {pending ? (
              <span className="flex items-center gap-2">
                <Spinner /> Researching…
              </span>
            ) : (
              'Research Trends'
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        {pending && results.length === 0 && (
          <div className="flex items-center justify-center gap-3 rounded-md border border-dashed py-8 text-sm text-muted-foreground">
            <Spinner className="text-primary" />
            <span>Claude is researching trending topics. Results will appear shortly…</span>
          </div>
        )}

        {results.length === 0 && !pending && (
          <div className="flex h-24 items-center justify-center rounded-md border border-dashed">
            <p className="text-sm text-muted-foreground">
              No research yet. Click "Research Trends" to start.
            </p>
          </div>
        )}

        {results.map((result) => {
          const raw = (result.raw_data ?? {}) as RawData
          const angles = Array.isArray(raw.content_angles) ? raw.content_angles : []
          const engagement = raw.engagement_level ?? 'low'

          return (
            <div
              key={result.id}
              className="rounded-lg border bg-card p-4 space-y-3 transition-colors hover:bg-muted/30"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="font-semibold leading-tight">{result.topic}</h3>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${platformStyle(result.platform)}`}
                  >
                    {result.platform}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${engagementStyle(engagement)}`}
                  >
                    {engagement} engagement
                  </span>
                </div>
              </div>

              <p className="text-sm text-muted-foreground leading-relaxed">{result.summary}</p>

              {angles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {angles.map((angle, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {angle}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

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
