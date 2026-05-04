import 'dotenv/config'
import express, { type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import projectsRouter from './routes/projects'
import researchRouter from './routes/research'
import contentRouter from './routes/content'
import videoRouter from './routes/video'

// Start workers (runs in same process; extract to separate process in production)
import './workers/research.worker'
import './workers/content.worker'
import './workers/video.worker'

const app: express.Express = express()
const PORT = process.env.PORT ?? 4000
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000'

app.use(cors({ origin: FRONTEND_URL, credentials: true }))
app.use(express.json())

// Routes
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/projects', projectsRouter)
app.use('/projects/:id/research', researchRouter)
app.use('/projects/:id/content', contentRouter)
app.use('/projects/:id/video', videoRouter)

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' })
})

// Global error handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err)

  if (err && typeof err === 'object' && 'issues' in err) {
    res.status(422).json({ error: 'Validation failed', details: (err as { issues: unknown }).issues })
    return
  }

  const message = err instanceof Error ? err.message : 'Internal server error'
  res.status(500).json({ error: message })
})

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`)
})

export default app
