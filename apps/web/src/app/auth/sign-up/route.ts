import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const fullName = String(formData.get('fullName') ?? '')
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')

  const pendingCookies: Array<{
    name: string
    value: string
    options?: CookieOptions
  }> = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          for (const c of cookiesToSet) pendingCookies.push(c)
        },
      },
    }
  )

  const origin = request.nextUrl.origin
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent('/login?verified=1')}`,
    },
  })

  if (error) {
    return NextResponse.redirect(
      new URL(`/signup?error=${encodeURIComponent(error.message)}`, request.url),
      { status: 303 }
    )
  }

  if (!data.session) {
    return NextResponse.redirect(
      new URL(`/signup?verifyEmail=${encodeURIComponent(email)}`, request.url),
      { status: 303 }
    )
  }

  const response = NextResponse.redirect(new URL('/dashboard', request.url), {
    status: 303,
  })
  for (const { name, value, options } of pendingCookies) {
    response.cookies.set(name, value, { ...(options ?? {}), path: '/' })
  }
  return response
}
