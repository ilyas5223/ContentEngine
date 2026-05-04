'use client'

import { Button } from '@/components/ui/button'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-4 text-center">
      <p className="text-destructive font-medium">Something went wrong</p>
      <p className="text-sm text-muted-foreground">{error.message}</p>
      <Button onClick={reset} variant="outline">
        Try again
      </Button>
    </div>
  )
}
