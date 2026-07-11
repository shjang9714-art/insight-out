import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import {
  PROFILE_COOKIE_NAME,
  PROFILE_COOKIE_TTL_SECONDS,
  buildProfileCookie,
  parseProfileCookie,
} from '@/lib/profile-cache-cookie'

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
    // gating 필드(onboarding_completed/role/approval_status)를 서명 쿠키로 캐시해
    // 매 페이지 이동마다 붙던 users profile DB 왕복을 생략(지시서 232 Part A).
    // 온보딩 미완 상태는 캐시하지 않음 — 온보딩 완료는 브라우저에서 직접 DB upsert 후
    // router.push 로 넘어오므로 서버가 그 전이를 가로채 쿠키를 갱신할 지점이 없음.
    // 캐시를 완료 후에만 기록하면 그 전이 구간에서 쿠키가 낡은 값(false)으로 대시보드를
    // 막는 사고를 구조적으로 피할 수 있다. 승인취소·강등 등 타 세션발 전이는 TTL(15분) 내 반영.
    let gate: { onboarding_completed: boolean; role: string; approval_status: string } | null = null

    const cachedCookie = request.cookies.get(PROFILE_COOKIE_NAME)?.value
    if (cachedCookie) {
      const cached = await parseProfileCookie(cachedCookie, user.id)
      if (cached) {
        gate = {
          onboarding_completed: cached.onboardingCompleted,
          role: cached.role,
          approval_status: cached.approvalStatus,
        }
      }
    }

    if (!gate) {
      const { data: profile } = await supabase
        .from('users')
        .select('onboarding_completed, role, approval_status')
        .eq('id', user.id)
        .single()

      gate = {
        onboarding_completed: profile?.onboarding_completed ?? false,
        role: profile?.role ?? 'user',
        approval_status: profile?.approval_status ?? 'pending',
      }

      if (gate.onboarding_completed) {
        const cookieValue = await buildProfileCookie({
          uid: user.id,
          onboardingCompleted: gate.onboarding_completed,
          role: gate.role,
          approvalStatus: gate.approval_status,
        })
        if (cookieValue) {
          supabaseResponse.cookies.set(PROFILE_COOKIE_NAME, cookieValue, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: PROFILE_COOKIE_TTL_SECONDS,
          })
        }
      }
    }

    if (!gate.onboarding_completed && pathname !== '/onboarding') {
      return NextResponse.redirect(new URL('/onboarding', request.url))
    }

    if (gate.onboarding_completed && pathname === '/onboarding') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    if (
      gate.onboarding_completed &&
      gate.approval_status !== 'approved' &&
      gate.role !== 'admin' &&
      pathname !== '/pending'
    ) {
      return NextResponse.redirect(new URL('/pending', request.url))
    }

    if (pathname === '/pending' && (gate.approval_status === 'approved' || gate.role === 'admin')) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    if (pathname.startsWith('/admin') && gate.role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    // 실험실(숨김 처리된 하위 카테고리 확인용) — 관리자 전용
    if (pathname.startsWith('/dashboard/lab') && gate.role !== 'admin') {
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
