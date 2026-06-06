import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import {
  FileText,
  ListChecks,
  Newspaper,
  Rss,
  Tags,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '어드민 홈 | Insight Out',
  description: 'Insight Out 운영 현황과 관리자 기능을 확인합니다.',
}

const MENU_ITEMS = [
  {
    href: '/admin/contents',
    label: '콘텐츠 관리',
    description: '수집 콘텐츠 승인·반려·삭제',
    icon: Newspaper,
  },
  {
    href: '/admin/sources',
    label: '소스 관리',
    description: 'RSS와 수집 소스 설정',
    icon: Rss,
  },
  {
    href: '/admin/keywords',
    label: '키워드 관리',
    description: '서비스별 자동 태깅 키워드',
    icon: Tags,
  },
  {
    href: '/admin/crawl-logs',
    label: '크롤링 현황',
    description: '자동 수집 결과와 오류 확인',
    icon: ListChecks,
  },
  {
    href: '/admin/upload',
    label: '리포트 업로드',
    description: '리서치 문서 직접 등록',
    icon: FileText,
  },
]

function getTodayStartInKst(): string {
  const now = new Date()
  const kstParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  return new Date(`${kstParts}T00:00:00+09:00`).toISOString()
}

export default async function AdminPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const todayStart = getTodayStartInKst()
  const [totalResult, todayResult, activeSourcesResult, pendingResult] =
    await Promise.all([
      supabase.from('contents').select('*', { count: 'exact', head: true }),
      supabase
        .from('contents')
        .select('*', { count: 'exact', head: true })
        .gte('collected_at', todayStart),
      supabase
        .from('sources')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true),
      supabase
        .from('contents')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
    ])

  const metrics = [
    { label: '총 콘텐츠', value: totalResult.count ?? 0 },
    { label: '오늘 수집', value: todayResult.count ?? 0 },
    { label: '활성 소스', value: activeSourcesResult.count ?? 0 },
    { label: '검토 대기', value: pendingResult.count ?? 0 },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">어드민 홈</h1>
        <p className="mt-1 text-sm text-gray-500">
          콘텐츠 수집 현황과 운영 기능을 한곳에서 관리합니다.
        </p>
      </div>

      <section aria-labelledby="metrics-heading">
        <h2 id="metrics-heading" className="mb-3 text-sm font-semibold text-gray-700">
          운영 현황
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-xl border border-gray-100 bg-white p-5"
            >
              <p className="text-xs font-medium text-gray-500">{metric.label}</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">
                {metric.value.toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="menu-heading">
        <h2 id="menu-heading" className="mb-3 text-sm font-semibold text-gray-700">
          관리 메뉴
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MENU_ITEMS.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className="group rounded-xl border border-gray-100 bg-white p-5 transition-colors hover:border-brand-200 hover:bg-brand-50"
              >
                <div className="flex items-start gap-4">
                  <span className="rounded-lg bg-gray-100 p-2.5 text-gray-600 transition-colors group-hover:bg-white group-hover:text-brand-600">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-semibold text-gray-900">{item.label}</h3>
                    <p className="mt-1 text-sm text-gray-500">{item.description}</p>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </section>
    </div>
  )
}
