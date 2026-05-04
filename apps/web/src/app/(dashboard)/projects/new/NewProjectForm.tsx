'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createProject, type CreateProjectState } from './actions'

const initialState: CreateProjectState = {}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="flex-1" disabled={pending}>
      {pending ? 'Creating…' : 'Create Project'}
    </Button>
  )
}

export function NewProjectForm() {
  const [state, formAction] = useFormState(createProject, initialState)

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Project Name</Label>
        <Input
          id="name"
          name="name"
          placeholder="e.g. Personal Finance YouTube"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="niche">Niche</Label>
        <Input
          id="niche"
          name="niche"
          placeholder="e.g. Investing for beginners"
          required
        />
      </div>
      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      <div className="flex gap-3 pt-2">
        <SubmitButton />
        <Button type="button" variant="outline" className="flex-1" asChild>
          <a href="/projects">Cancel</a>
        </Button>
      </div>
    </form>
  )
}
