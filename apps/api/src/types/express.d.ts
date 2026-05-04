import 'express-serve-static-core'

declare module 'express-serve-static-core' {
  interface Request {
    userId?: string
    usageInfo?: { used: number; limit: number; plan: string }
  }
}
