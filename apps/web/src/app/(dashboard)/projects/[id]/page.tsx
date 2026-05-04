import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ResearchSection } from '@/components/ResearchSection'
import { ContentSection } from '@/components/ContentSection'
import { formatDate } from '@contentengine/shared'
import type { ResearchResult, ContentItem } from '@contentengine/shared'

interface Props {
  params: { id: string }
}

export default async function ProjectDetailPage({ params }: Props) {
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!project) notFound()

  // Get current user for usage stats
  const { data: { user } } = await supabase.auth.getUser()

  const PLAN_LIMITS: Record<string, number> = { free: 5, pro: 100, agency: -1 }

  // Fetch research results, content items, user plan + monthly usage in parallel
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const [
    { data: researchResults },
    { data: contentItems },
    { data: userRow },
    { count: monthlyCount },
  ] = await Promise.all([
    supabase
      .from('research_results')
      .select('*')
      .eq('project_id', params.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('content_items')
      .select('*')
      .eq('project_id', params.id)
      .order('created_at', { ascending: false }),
    supabase.from('users').select('plan').eq('id', user?.id ?? '').single(),
    supabase
      .from('content_items')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startOfMonth.toISOString()),
  ])

  const plan = userRow?.plan ?? 'free'
  const limit = PLAN_LIMITS[plan] ?? 5
  const initialResults = (researchResults ?? []) as ResearchResult[]
  const initialContentItems = (contentItems ?? []) as ContentItem[]
  const contentCount = initialContentItems.length
  const initialUsage = { used: monthlyCount ?? 0, limit, plan }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{project.name}</h1>
            <Badge variant="secondary">{project.status}</Badge>
          </div>
          <p className="text-muted-foreground">{project.niche}</p>
          <p className="text-xs text-muted-foreground">Created {formatDate(project.created_at)}</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/projects">← Back</Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Research Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{initialResults.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Content Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{contentCount ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Live research section */}
      <ResearchSection projectId={params.id} initialResults={initialResults} />

      {/* Live content section */}
      <ContentSection
        projectId={params.id}
        initialItems={initialContentItems}
        researchResults={initialResults}
        initialUsage={initialUsage}
      />
    </div>
  )
}
