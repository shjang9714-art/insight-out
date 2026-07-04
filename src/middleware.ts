import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  // /api/cron/* 는 자체 CRON_SECRET 로 인증, /api/version 은 공개 배포정보,
  // /api/mcp 는 자체 Bearer(MCP_TOKEN) 인증 →
  // 로그인 가드에서 제외 (제외 안 하면 세션 없는 요청이 /login 으로 리다이렉트됨)
  const publicPaths = ['/login', '/auth/callback', '/api/cron', '/api/version', '/api/newsletter/unsubscribe', '/api/webhooks/brevo', '/api/mcp']
  if (!user && !publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  if (user && !publicPaths.some((p) => pathname.startsWith(p))) {
    const { data: profile } = await supabase
      .from('users')
      .select('onboarding_completed, role, approval_status')
      .eq('id', user.id)
      .single()

    if (!profile?.onboarding_completed && pathname !== '/onboarding') {
      return NextResponse.redirect(new URL('/onboarding', request.url))
    }

    if (profile?.onboarding_completed && pathname === '/onboarding') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    if (
      profile?.onboarding_completed &&
      profile.approval_status !== 'approved' &&
      profile.role !== 'admin' &&
      pathname !== '/pending'
    ) {
      return NextResponse.redirect(new URL('/pending', request.url))
    }

    if (pathname === '/pending' && (profile?.approval_status === 'approved' || profile?.role === 'admin')) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    if (pathname.startsWith('/admin') && profile?.role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
