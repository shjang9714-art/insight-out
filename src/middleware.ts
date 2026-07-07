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
  // API 라우트는 JSON 응답이라 온보딩/승인/관리자 리다이렉트 대상이 될 수 없고(리다이렉트해도
  // 클라이언트는 그냥 실패로 처리됨), 관리자 API는 각 라우트 핸들러에서 role을 자체 재검증하고
  // 있어 아래 profile 조회가 완전히 중복 — API 요청마다 걸리던 Supabase 왕복 1회를 절감
  const isApiRoute = pathname.startsWith('/api/')

  if (!user && !publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  if (user && !isApiRoute && !publicPaths.some((p) => pathname.startsWith(p))) {
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
