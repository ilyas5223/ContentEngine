import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const PLAN_LIMITS: Record<string, number> = { free: 5, pro: 100, agency: -1 }

const STATUS_STYLES: Record<string, string> = {
  queued: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  done: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const [
    { data: userRow },
    { data: projects, count: totalProjects },
    { count: researchCount },
    { count: totalContentCount },
    { count: monthlyCount },
    { data: recentContent },
  ] = await Promise.all([
    supabase.from('users').select('plan, full_name').eq('id', user.id).single(),
    supabase
      .from('projects')
      .select('id, name, niche, status, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(5),
    supabase.from('research_results').select('id', { count: 'exact', head: true }),
    supabase.from('content_items').select('id', { count: 'exact', head: true }),
    supabase
      .from('content_items')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startOfMonth.toISOString()),
    supabase
      .from('content_items')
      .select('id, title, status, platform, created_at, project_id, projects(name)')
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const plan = userRow?.plan ?? 'free'
  const limit = PLAN_LIMITS[plan]
  const usageLabel =
    limit === -1 ? `${monthlyCount ?? 0} (unlimited)` : `${monthlyCount ?? 0} / ${limit}`
  const displayName = userRow?.full_name ?? user?.email?.split('@')[0] ?? 'there'

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Welcome back, {displayName}!</h1>
          <p className="text-muted-foreground">Here's what's happening with your content pipeline.</p>
        </div>
        <Button asChild>
          <Link href="/projects/new">New Project</Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Projects" value={totalProjects ?? 0} />
        <StatCard title="Research Done" value={researchCount ?? 0} />
        <StatCard title="Content Generated" value={totalContentCount ?? 0} />
        <StatCard title="Usage This Month" value={usageLabel} />
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Recent Projects */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Recent Projects</h2>
            <Link href="/projects" className="text-sm text-muted-foreground hover:text-foreground">
              View all →
            </Link>
          </div>
          {projects && projects.length > 0 ? (
            <div className="space-y-2">
              {projects.map((p) => (
                <Link key={p.id} href={`/projects/${p.id}`}>
                  <Card className="transition-colors hover:bg-muted/50">
                    <CardContent className="flex items-center justify-between py-3">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{p.niche}</p>
                      </div>
                      <Badge variant="secondary" className="ml-2 shrink-0">
                        {p.status}
                      </Badge>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No projects yet.{' '}
                <Link href="/projects/new" className="text-primary hover:underline">
                  Create one →
                </Link>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Recent Content */}
        <div className="space-y-3">
          <h2 className="font-semibold">Recent Content</h2>
          {recentContent && recentContent.length > 0 ? (
            <div className="space-y-2">
              {(recentContent as any[]).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.projects?.name ?? '—'} · {item.platform ?? item.type}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      STATUS_STYLES[item.status] ?? STATUS_STYLES.queued
                    }`}
                  >
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No content generated yet.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ title, value }: { title: string; value: number | string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  )
}
