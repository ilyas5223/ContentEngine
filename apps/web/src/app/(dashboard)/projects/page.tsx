import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@contentengine/shared'

export default async function ProjectsPage() {
  const supabase = await createClient()

  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-muted-foreground">Manage your content projects</p>
        </div>
        <Button asChild>
          <Link href="/projects/new">New Project</Link>
        </Button>
      </div>

      {!projects || projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center">
          <p className="text-lg font-medium">No projects yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first project to start generating content.
          </p>
          <Button asChild className="mt-4">
            <Link href="/projects/new">Create Project</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="h-full transition-colors hover:bg-muted/50">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{project.name}</CardTitle>
                    <Badge variant="secondary">{project.status}</Badge>
                  </div>
                  <CardDescription>{project.niche}</CardDescription>
                </CardHeader>
                <CardFooter>
                  <p className="text-xs text-muted-foreground">
                    Created {formatDate(project.created_at)}
                  </p>
                </CardFooter>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
