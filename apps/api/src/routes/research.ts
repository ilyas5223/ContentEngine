import { Router, type Request, type Response, type NextFunction } from 'express'
import { requireAuth } from '../middleware/auth'
import { supabaseAdmin } from '../services/supabase'
import { researchQueue } from '../services/queue'

const router: Router = Router({ mergeParams: true })

router.use(requireAuth)

// Plan limits: research runs allowed per calendar month
const PLAN_LIMITS: Record<string, number> = {
  free: 5,
  pro: 50,
  agency: Infinity,
}

async function verifyProjectOwner(projectId: string, userId: string) {
  const { data } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', userId)
    .single()
  return !!data
}

// POST /projects/:id/research
router.post('/', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const { id: projectId } = req.params
    const userId = req.userId!

    const owned = await verifyProjectOwner(projectId, userId)
    if (!owned) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    // Get user plan
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('plan')
      .eq('id', userId)
      .single()

    const plan = userRow?.plan ?? 'free'
    const limit = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free

    if (limit !== Infinity) {
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)

      // Count research + content items created this month across all user projects
      const [{ count: researchCount }, { count: contentCount }] = await Promise.all([
        supabaseAdmin
          .from('research_results')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', startOfMonth.toISOString())
          .in(
            'project_id',
            (
              await supabaseAdmin
                .from('projects')
                .select('id')
                .eq('user_id', userId)
            ).data?.map((p) => p.id) ?? []
          ),
        supabaseAdmin
          .from('content_items')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', startOfMonth.toISOString())
          .in(
            'project_id',
            (
              await supabaseAdmin
                .from('projects')
                .select('id')
                .eq('user_id', userId)
            ).data?.map((p) => p.id) ?? []
          ),
      ])

      const used = (researchCount ?? 0) + (contentCount ?? 0)
      if (used >= limit) {
        res.status(429).json({
          error: `Monthly limit reached for ${plan} plan (${limit} items). Upgrade to generate more.`,
          used,
          limit,
        })
        return
      }
    }

    // Get niche from project
    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('niche')
      .eq('id', projectId)
      .single()

    if (!project) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    const job = await researchQueue.add('research', {
      project_id: projectId,
      niche: project.niche,
      user_id: userId,
    })

    res.status(202).json({ job_id: job.id, status: 'queued' })
  } catch (err) {
    next(err)
  }
})

// GET /projects/:id/research
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
      .from('research_results')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (error) throw error

    res.json(data)
  } catch (err) {
    next(err)
  }
})

export default router
