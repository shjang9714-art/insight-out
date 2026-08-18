import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { ADMIN_ROLES } from '@/lib/admin/capabilities'
import {
  PROFILE_COOKIE_NAME,
  PROFILE_COOKIE_TTL_SECONDS,
  buildProfileCookie,
  parseProfileCookie,
} from '@/lib/profile-cache-cookie'

export async function middleware(request: NextRequest) {
  // 대시보드 레이아웃(서버 컴포넌트)이 현재 pathname을 알아야 콘텐츠 상세(/dashboard/
  // contents/[id]) 진입 시 상단 네비 초기 활성 탭을 서버에서 확정할 수 있다(§20260720
  // fix/nav-active-server-side) — Server Component는 headers()로만 요청 헤더를 읽을 수
  // 있어 여기서 미리 심어둔다. request.cookies.set()이 이후 request.headers를 바꾸므로
  // NextResponse.next() 호출 시점마다 request.headers를 새로 복제해 x-pathname을 얹는다.
  const withPathname = () => {
    const headers = new Headers(request.headers)
    headers.set('x-pathname', request.nextUrl.pathname)
    headers.set('x-http-method', request.method)
    return headers
  }
  let supabaseResponse = NextResponse.next({ request: { headers: withPathname() } })

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
          supabaseResponse = NextResponse.next({ request: { headers: withPathname() } })
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
  // 뉴스레터 링크는 비로그인 상태로 클릭될 수 있어(지시서 20260723 로그인 장벽 옵션 1),
  // 콘텐츠 상세·인사이트 상세 2종 경로만 예외로 공개한다. 다른 /dashboard 경로는 계속 보호.
  // (지식보고서·리포트류 콘텐츠도 /dashboard/contents/[id] 로 렌더되므로 별도 경로가 필요 없다 —
  // STEP 0에서 /dashboard/reports/[id] 는 별개의 사용자 생성 AI 보고서 라우트임을 확인했다.)
  const publicPaths = [
    '/login', '/auth/callback', '/api/cron', '/api/version', '/api/newsletter/unsubscribe',
    '/api/webhooks/brevo', '/api/mcp', '/api/council', '/manifest.webmanifest', '/sw.js',
    '/dashboard/contents/', '/dashboard/daily-insights/',
  ]
  // API 라우트는 JSON 응답이라 온보딩/승인/관리자 리다이렉트 대상이 될 수 없고(리다이렉트해도
  // 클라이언트는 그냥 실패로 처리됨), 관리자 API는 각 라우트 핸들러에서 role을 자체 재검증하고
  // 있어 아래 profile 조회가 완전히 중복 — API 요청마다 걸리던 Supabase 왕복 1회를 절감
  const isApiRoute = pathname.startsWith('/api/')
  // 온보딩 제출은 서버 액션(POST /onboarding, Next-Action 헤더 포함)으로 들어온다.
  // 미들웨어가 이 요청에 리다이렉트(예: 이전 부분 실패로 onboarding_completed 가 이미
  // true 라 /dashboard 로 되돌림)를 돌려주면, 클라이언트는 Server Action 응답 대신
  // 리다이렉트를 받아 "An unexpected response was received from the server" 로 깨진다.
  // 액션 자체가 인증·상태를 다시 검증하므로 게이팅 리다이렉트 대상에서 제외한다.
  const isOnboardingAction = pathname === '/onboarding' && request.headers.get('next-action') !== null

  if (!user && !isOnboardingAction && !publicPaths.some((p) => pathname.startsWith(p))) {
    // F-08 — 최초 방문(사유 없음)과 세션 만료(사유 있음)를 구분한다. sb-*-auth-token 쿠키가
    // 남아 있는데 getUser()가 null이면 리프레시 토큰이 만료/무효화된 것 — 로그인 화면이
    // "세션이 만료되어 다시 로그인이 필요합니다"를 보여줄 수 있게 reason을 붙인다.
    const hadSession = request.cookies.getAll().some((c) => c.name.startsWith('sb-') && c.name.includes('-auth-token'))
    const loginUrl = new URL('/login', request.url)
    if (hadSession) loginUrl.searchParams.set('reason', 'expired')
    return NextResponse.redirect(loginUrl)
  }

  if (user && !isApiRoute && !isOnboardingAction && (!publicPaths.some((p) => pathname.startsWith(p)) || pathname === '/login')) {
    // gating 필드를 서명 쿠키로 캐시해
    // 매 페이지 이동마다 붙던 users profile DB 왕복을 생략(지시서 232 Part A).
    // 온보딩 미완 상태는 캐시하지 않음 — 완료 직후 전이에서 낡은 false 쿠키가
    // 대시보드 진입을 가로막지 않도록 완료 상태만 저장한다.
    // 캐시를 완료 후에만 기록하면 그 전이 구간에서 쿠키가 낡은 값(false)으로 대시보드를
    // 막는 사고를 구조적으로 피할 수 있다. 승인취소·강등 등 타 세션발 전이는 /admin은 즉시,
    // 그 외 경로는 TTL(15분) 내 반영(지시서 506).
    let gate: {
      onboarding_completed: boolean
      role: string
      approval_status: string
      has_password: boolean
    } | null = null
    let hasPasswordGateEnabled = true

    // /admin 은 캐시를 건너뛰고 항상 DB를 본다 — 관리자 role/승인상태 강등이 다음 요청에
    // 즉시 반영돼야 한다(지시서 506 F-03). 어드민 트래픽은 소수라 DB 조회 증가 부담이 작다.
    const isAdminPath = pathname.startsWith('/admin')
    const cachedCookie = isAdminPath ? undefined : request.cookies.get(PROFILE_COOKIE_NAME)?.value
    if (cachedCookie) {
      const cached = await parseProfileCookie(cachedCookie, user.id)
      if (cached) {
        gate = {
          onboarding_completed: cached.onboardingCompleted,
          role: cached.role,
          approval_status: cached.approvalStatus,
          has_password: cached.hasPassword,
        }
      }
    }

    if (!gate) {
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('onboarding_completed, role, approval_status, has_password')
        .eq('id', user.id)
        .single()

      if (profileError?.code === '42703') {
        hasPasswordGateEnabled = false
        const { data: fallbackProfile } = await supabase
          .from('users')
          .select('onboarding_completed, role, approval_status')
          .eq('id', user.id)
          .single()
        gate = {
          onboarding_completed: fallbackProfile?.onboarding_completed ?? false,
          role: fallbackProfile?.role ?? 'user',
          approval_status: fallbackProfile?.approval_status ?? 'pending',
          has_password: false,
        }
      } else {
        gate = {
          onboarding_completed: profile?.onboarding_completed ?? false,
          role: profile?.role ?? 'user',
          approval_status: profile?.approval_status ?? 'pending',
          has_password: profile?.has_password ?? false,
        }
      }

      if (gate.onboarding_completed && hasPasswordGateEnabled) {
        const cookieValue = await buildProfileCookie({
          uid: user.id,
          onboardingCompleted: gate.onboarding_completed,
          role: gate.role,
          approvalStatus: gate.approval_status,
          hasPassword: gate.has_password,
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

    // F-09 — 자가 비활성화 계정: 다른 게이트보다 먼저 걸러 매 요청마다 즉시 로그아웃시킨다.
    // /pending으로 보내면 "가입 승인 대기" 문구가 뜨는 다른 상태와 헷갈리므로 별도 사유로 /login에 되돌린다.
    if (gate.approval_status === 'deactivated') {
      await supabase.auth.signOut()
      return NextResponse.redirect(new URL('/login?reason=deactivated', request.url))
    }

    const isGoogleUser = user.app_metadata.provider === 'google'
      || user.identities?.some((identity) => identity.provider === 'google') === true
    const needsPassword = hasPasswordGateEnabled && !gate.has_password && !isGoogleUser

    if (needsPassword) {
      if (pathname !== '/set-password') {
        return NextResponse.redirect(new URL('/set-password', request.url))
      }
      return supabaseResponse
    }

    if (pathname === '/set-password') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    if (pathname === '/login') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
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

    if (pathname.startsWith('/admin') && !ADMIN_ROLES.includes(gate.role as typeof ADMIN_ROLES[number])) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    // 실험실(숨김 처리된 하위 카테고리 확인용) — 관리자 전용
    if (pathname.startsWith('/dashboard/lab') && gate.role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return supabaseResponse
}

// ⚠️ 이 파일을 향후 Next.js 16 컨벤션(`src/proxy.ts`의 `proxy` 함수)으로 옮길 때,
// 위 publicPaths의 '/dashboard/contents/', '/dashboard/daily-insights/' 두 항목을
// 반드시 함께 옮길 것 — 과거 이 프로젝트에서 proxy.ts가 죽은 코드로 방치돼 가드가
// 실제로 적용되지 않은 사고가 있었다. 빌드 후 .next/server/middleware-manifest.json 에
// middleware 항목이 잡히는지, matcher가 이 파일의 config.matcher와 일치하는지로 검증할 것
// (지시서 20260723 로그인 장벽 옵션 1 검증 시 next build + next start 로 실측 확인함).
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
