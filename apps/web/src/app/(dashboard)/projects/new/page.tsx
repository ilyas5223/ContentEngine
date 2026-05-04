import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { NewProjectForm } from './NewProjectForm'

export default function NewProjectPage() {
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold">New Project</h1>
        <p className="text-muted-foreground">Set up a new content project</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Project Details</CardTitle>
          <CardDescription>
            Give your project a name and define the niche it targets.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewProjectForm />
        </CardContent>
      </Card>
    </div>
  )
}
