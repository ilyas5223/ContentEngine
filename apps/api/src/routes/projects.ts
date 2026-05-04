import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth'
import { supabaseAdmin } from '../services/supabase'

const router: Router = Router()

// All project routes require auth
router.use(requireAuth)

const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  niche: z.string().min(1).max(100),
})

// POST /projects
router.post('/', async (req, res, next) => {
  try {
    const body = createProjectSchema.parse(req.body)

    const { data, error } = await supabaseAdmin
      .from('projects')
      .insert({ ...body, user_id: req.userId })
      .select()
      .single()

    if (error) throw error

    res.status(201).json(data)
  } catch (err) {
    next(err)
  }
})

// GET /projects
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('projects')
      .select('*')
      .eq('user_id', req.userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })

    if (error) throw error

    res.json(data)
  } catch (err) {
    next(err)
  }
})

// GET /projects/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { data: project, error } = await supabaseAdmin
      .from('projects')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .single()

    if (error || !project) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    // Fetch counts in parallel
    const [researchCount, contentCount] = await Promise.all([
      supabaseAdmin
        .from('research_results')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', req.params.id),
      supabaseAdmin
        .from('content_items')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', req.params.id),
    ])

    res.json({
      ...project,
      _count: {
        research_results: researchCount.count ?? 0,
        content_items: contentCount.count ?? 0,
      },
    })
  } catch (err) {
    next(err)
  }
})

// DELETE /projects/:id  (soft delete — sets status to 'archived')
router.delete('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('projects')
      .update({ status: 'archived' })
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .select()
      .single()

    if (error || !data) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
