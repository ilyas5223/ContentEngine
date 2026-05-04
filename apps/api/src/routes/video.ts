import { Router, type Request, type Response, type NextFunction } from 'express'
import { requireAuth } from '../middleware/auth'
import { supabaseAdmin } from '../services/supabase'
import { videoQueue, type VideoTemplate } from '../services/queue'

const VALID_TEMPLATES: readonly VideoTemplate[] = [
  'TopicExplainer',
  'TwitterThread',
  'QuickTip',
] as const

const router: Router = Router({ mergeParams: true })

router.use(requireAuth)

async function verifyProjectOwner(projectId: string, userId: string) {
  const { data } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', userId)
    .single()
  return !!data
}

/**
 * POST /projects/:id/video
 * Body: { topic_id: string }
 *
 * Pro / agency plans only. Creates a content_item with status='processing'
 * and queues a video generation job.
 */
router.post('/', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const { id: projectId } = req.params
    const userId = req.userId!
    const { topic_id, template } = req.body as {
      topic_id?: string
      template?: string
    }

    if (!topic_id) {
      res.status(400).json({ error: 'topic_id is required' })
      return
    }

    const chosenTemplate: VideoTemplate =
      template && VALID_TEMPLATES.includes(template as VideoTemplate)
        ? (template as VideoTemplate)
        : 'TopicExplainer'

    // Check plan — video is pro/agency only
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('plan')
      .eq('id', userId)
      .single()

    const plan = userRow?.plan ?? 'free'
    if (plan === 'free') {
      res.status(403).json({ error: 'Video generation is available on Pro and Agency plans.' })
      return
    }

    const owned = await verifyProjectOwner(projectId, userId)
    if (!owned) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    // Verify research result belongs to this project
    const { data: research } = await supabaseAdmin
      .from('research_results')
      .select('id, topic')
      .eq('id', topic_id)
      .eq('project_id', projectId)
      .single()

    if (!research) {
      res.status(404).json({ error: 'Research result not found' })
      return
    }

    // Insert placeholder content_item immediately so Realtime fires
    const { data: contentItem, error: insertError } = await supabaseAdmin
      .from('content_items')
      .insert({
        project_id: projectId,
        research_result_id: topic_id,
        type: 'video',
        platform: 'video',
        title: `Video: ${research.topic}`,
        content: '',
        status: 'processing',
        progress_step: 'queued',
        output_url: null,
      })
      .select('id')
      .single()

    if (insertError || !contentItem) {
      throw new Error(`Failed to create content item: ${insertError?.message}`)
    }

    // Queue the job
    const job = await videoQueue.add('video', {
      project_id: projectId,
      research_result_id: topic_id,
      content_item_id: contentItem.id,
      topic: research.topic,
      user_id: userId,
      template: chosenTemplate,
    })

    res.status(202).json({ job_id: job.id, content_item_id: contentItem.id, status: 'queued' })
  } catch (err) {
    next(err)
  }
})

export default router
