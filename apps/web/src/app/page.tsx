import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const FEATURES = [
  {
    title: 'AI-Powered Research',
    description:
      'Automatically discover trending topics across YouTube, Reddit, Twitter, and more — so you never run out of ideas.',
  },
  {
    title: 'Multi-Platform Content',
    description:
      'Generate Twitter threads, LinkedIn posts, Instagram captions, and SEO blog articles in one click with Claude AI.',
  },
  {
    title: 'Managed Pipeline',
    description:
      'A real-time job queue keeps your content flowing. Track status, copy with one click, and publish at your own pace.',
  },
]

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur px-6 h-14 flex items-center justify-between">
        <span className="text-lg font-bold">ContentEngine</span>
        <div className="flex gap-2">
          <Button variant="ghost" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/signup">Get Started Free</Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-4 py-24 gap-6">
        <div className="inline-flex items-center rounded-full border px-3 py-1 text-sm text-muted-foreground mb-2">
          Powered by Claude AI
        </div>
        <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight max-w-3xl leading-tight">
          Your AI Content Agency,{' '}
          <span className="text-primary">on Autopilot</span>
        </h1>
        <p className="text-xl text-muted-foreground max-w-xl">
          Research trends, generate platform-ready content, and manage your entire content
          pipeline — all in one place.
        </p>
        <div className="flex gap-3 flex-wrap justify-center">
          <Button size="lg" asChild>
            <Link href="/signup">Get Started Free →</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/login">Sign In</Link>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">No credit card required · 5 free generations/month</p>
      </section>

      {/* Features */}
      <section className="border-t bg-muted/30 px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-3xl font-bold text-center mb-3">
            Everything you need to scale content
          </h2>
          <p className="text-center text-muted-foreground mb-12">
            From research to publish-ready posts in minutes, not hours.
          </p>
          <div className="grid gap-6 sm:grid-cols-3">
            {FEATURES.map((f) => (
              <Card key={f.title} className="text-left">
                <CardHeader>
                  <CardTitle className="text-lg">{f.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{f.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20 text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to automate your content?</h2>
        <p className="text-muted-foreground mb-8 max-w-md mx-auto">
          Join creators and agencies using ContentEngine to stay ahead of trends without the manual effort.
        </p>
        <Button size="lg" asChild>
          <Link href="/signup">Get Started Free →</Link>
        </Button>
      </section>

      <footer className="border-t px-6 py-4 text-center text-sm text-muted-foreground">
        © 2026 ContentEngine. All rights reserved.
      </footer>
    </div>
  )
}
