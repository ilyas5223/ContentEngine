'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type CreateProjectState = { error?: string }

export async function createProject(
  _prev: CreateProjectState,
  formData: FormData
): Promise<CreateProjectState> {
  const name = (formData.get('name') as string | null)?.trim() ?? ''
  const niche = (formData.get('niche') as string | null)?.trim() ?? ''

  if (!name || !niche) {
    return { error: 'Project name and niche are required.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data, error } = await supabase
    .from('projects')
    .insert({ name, niche, user_id: user.id })
    .select('id')
    .single()

  if (error || !data) {
    console.error('[createProject] insert failed:', error)
    return { error: error?.message ?? 'Failed to create project.' }
  }

  redirect(`/projects/${data.id}`)
}
