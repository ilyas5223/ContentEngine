import type { Request, Response, NextFunction } from 'express'
import { supabaseAdmin } from '../services/supabase'

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' })
    return
  }

  const token = authHeader.slice(7)

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)

  if (error || !user) {
    console.error('[auth] token validation failed:', error?.message ?? 'no user', {
      tokenPrefix: token.slice(0, 12) + '…',
      tokenLength: token.length,
    })
    res.status(401).json({ error: 'Invalid or expired token' })
    return
  }

  req.userId = user.id
  next()
}
