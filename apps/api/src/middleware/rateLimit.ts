import type { Request, Response, NextFunction } from 'express'
import { supabaseAdmin } from '../services/supabase'

const CONTENT_LIMITS: Record<string, number> = {
  free: 5,
  pro: 100,
  agency: Infinity,
}

/**
 * Middleware that checks the user's monthly content_items generation quota.
 * Attaches `req.usageInfo = { used, limit, plan }` for use in route handlers.
 */
export async function checkContentRateLimit(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.userId!

    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('plan')
      .eq('id', userId)
      .single()

    const plan = userRow?.plan ?? 'free'
    const limit = CONTENT_LIMITS[plan] ?? CONTENT_LIMITS.free

    if (limit === Infinity) {
      req.usageInfo = { used: 0, limit: -1, plan }
      return next()
    }

    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    // Get all project IDs for this user
    const { data: projects } = await supabaseAdmin
      .from('projects')
      .select('id')
      .eq('user_id', userId)

    const projectIds = projects?.map((p) => p.id) ?? []

    if (projectIds.length === 0) {
      req.usageInfo = { used: 0, limit, plan }
      return next()
    }

    const { count } = await supabaseAdmin
      .from('content_items')
      .select('id', { count: 'exact', head: true })
      .in('project_id', projectIds)
      .gte('created_at', startOfMonth.toISOString())

    const used = count ?? 0
    req.usageInfo = { used, limit, plan }

    if (used >= limit) {
      res.status(429).json({
        error: `Monthly content limit reached for ${plan} plan (${limit} items). Upgrade to generate more.`,
        used,
        limit,
      })
      return
    }

    next()
  } catch (err) {
    next(err)
  }
}
