import { Router, type Request, type Response, type NextFunction } from 'express'
import { requireAuth } from '../middleware/auth'
import { checkContentRateLimit } from '../middleware/rateLimit'
import { supabaseAdmin } from '../services/supabase'
import { contentQueue } from '../services/queue'

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

// POST /projects/:id/generate — queue content generation for a research result
router.post('/', checkContentRateLimit, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const { id: projectId } = req.params
    const userId = req.userId!
    const { topic_id } = req.body as { topic_id?: string }

    if (!topic_id) {
      res.status(400).json({ error: 'topic_id is required' })
      return
    }

    const owned = await verifyProjectOwner(projectId, userId)
    if (!owned) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    // Verify the research result belongs to this project
    const { data: researchResult } = await supabaseAdmin
      .from('research_results')
      .select('id')
      .eq('id', topic_id)
      .eq('project_id', projectId)
      .single()

    if (!researchResult) {
      res.status(404).json({ error: 'Research result not found' })
      return
    }

    const job = await contentQueue.add('content', {
      project_id: projectId,
      research_result_id: topic_id,
      content_type: 'post',
      user_id: userId,
    })

    res.status(202).json({
      job_id: job.id,
      status: 'queued',
      usage: req.usageInfo,
    })
  } catch (err) {
    next(err)
  }
})

// GET /projects/:id/content — list content items
router.get('/', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const { id: projectId } = req.params
    const userId = req.userId!

    const owned = await verifyProjectOwner(projectId, userId)
    if (!owned) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    const { data, error } = await supabaseAdmin
      .from('content_items')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (error) throw error

    res.json(data)
  } catch (err) {
    next(err)
  }
})

// GET /projects/:id/content/usage — return this month's usage for the user
router.get('/usage', checkContentRateLimit, async (req, res) => {
  res.json(req.usageInfo)
})

export default router
