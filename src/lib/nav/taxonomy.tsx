import type { ReactNode } from 'react'
import AiMark from '@/components/ui/AiMark'

// ─── L2(하위 탭) 중앙 정의(372) ─────────────────────────────────────────────────
// DashboardHeader가 L1 아래 sticky L2 행을 렌더할 때 이 파일 하나만 참조한다.
// 각 섹션의 L2 항목·URL(param/value)·기본 활성 탭은 기존 InsightViewTabs 사용처
// (ContentsBoard·AiInsightBoard·AiInsightTabs·EntityTabs·ReportTabs)와 1:1 일치.

export interface L2Tab {
  id: string
  label: ReactNode
  value: string
}

export interface L2Section {
  /** L1 탭의 href와 동일 — DashboardHeader의 NAV_TABS와 매핑 키 */
  l1Href: string
  /** L2 링크가 가리키는 기본 경로 */
  basePath: string
  /** L2 상태를 담는 쿼리 파라미터 키 (예: view, category) */
  paramKey: string
  /** URL에 파라미터가 없을 때 기본 활성 탭 id */
  defaultId: string
  /** 같은 basePath에 머무는 상태에서 탭 전환 시 다른 쿼리 파라미터(기간 필터 등) 유지 여부.
   *  콘텐츠·AI인사이트는 기존 onChange 핸들러가 유지했고, 기업동향·리포트는 정적 href라 유지 안 함. */
  preserveParams: boolean
  tabs: L2Tab[]
}

export const NAV_SECTIONS: Record<string, L2Section> = {
  '/dashboard/issues': {
    l1Href: '/dashboard/issues',
    basePath: '/dashboard/issues',
    paramKey: 'view',
    defaultId: 'brief',
    preserveParams: true,
    tabs: [
      { id: 'brief', label: '핵심 인사이트', value: 'brief' },
      { id: 'keyword', label: '키워드 분석', value: 'keyword' },
      { id: 'graph', label: '관계지도', value: 'graph' },
    ],
  },
  '/dashboard/entities': {
    l1Href: '/dashboard/entities',
    basePath: '/dashboard/entities',
    paramKey: 'view',
    defaultId: 'watchlist',
    preserveParams: false,
    tabs: [
      { id: 'watchlist', label: '주요 기업', value: 'watchlist' },
      { id: 'competitor', label: '경쟁사 최근 뉴스', value: 'competitor' },
      { id: 'trend', label: '경쟁사 주간 브리핑', value: 'trend' },
      { id: 'documents', label: '기업·기술 자료', value: 'documents' },
    ],
  },
  '/dashboard/contents': {
    l1Href: '/dashboard/contents',
    basePath: '/dashboard/contents',
    paramKey: 'category',
    defaultId: '뉴스',
    preserveParams: true,
    tabs: [
      { id: '뉴스', label: '뉴스', value: '뉴스' },
      { id: '유튜브', label: '유튜브', value: '유튜브' },
      { id: '웹인사이트', label: '웹인사이트', value: '웹인사이트' },
    ],
  },
  '/dashboard/reports': {
    l1Href: '/dashboard/reports',
    basePath: '/dashboard/reports',
    paramKey: 'view',
    defaultId: 'ai',
    preserveParams: false,
    tabs: [
      { id: 'ai', label: <>AI 리포트<AiMark className="ml-1" /></>, value: 'ai' },
      { id: 'external', label: '외부 리포트', value: 'external' },
      { id: 'knowledge', label: '지식보고서', value: 'knowledge' },
    ],
  },
}

// ─── 라우트별 강제 활성 탭(기존 페이지의 value prop 하드코딩과 1:1) ───────────────
// l1Href가 호출 측에서 이미 결정돼 넘어오므로, 여기서는 pathname만으로 판정한다.
const FORCED_L2: {
  test: (pathname: string) => boolean
  l1Href: string
  activeId: (searchParams: URLSearchParams) => string
}[] = [
  // 경쟁사 주간 브리핑 상세 — CompetitorWeeklyDetailPage의 <EntityTabs value="trend" />
  {
    test: (p) => p.startsWith('/dashboard/entities/competitor-weekly'),
    l1Href: '/dashboard/entities',
    activeId: () => 'trend',
  },
  // 기업 상세(단건) — entities/[id]/page.tsx의 <EntityTabs value="watchlist" />
  {
    test: (p) => /^\/dashboard\/entities\/[^/]+$/.test(p),
    l1Href: '/dashboard/entities',
    activeId: () => 'watchlist',
  },
  // 기업 상세를 AI인사이트 키워드 탭에서 진입(origin=issues) — <AiInsightTabs value={view ?? 'keyword'} />
  {
    test: (p) => /^\/dashboard\/entities\/[^/]+$/.test(p),
    l1Href: '/dashboard/issues',
    activeId: (sp) => sp.get('view') ?? 'keyword',
  },
  // 일간 인사이트 상세 — <AiInsightTabs value="brief" />
  {
    test: (p) => p.startsWith('/dashboard/daily-insights/'),
    l1Href: '/dashboard/issues',
    activeId: () => 'brief',
  },
  // 키워드 상세 — <AiInsightTabs value="keyword" />
  {
    test: (p) => p.startsWith('/dashboard/keywords/'),
    l1Href: '/dashboard/issues',
    activeId: () => 'keyword',
  },
]

export interface ActiveL2 {
  section: L2Section
  activeId: string
}

/** l1Href(활성 또는 호버 프리뷰 대상 L1)에 대해, 현재 라우트 기준 L2 상태를 계산한다. */
export function getL2ForSection(
  l1Href: string,
  pathname: string,
  searchParams: URLSearchParams
): ActiveL2 | null {
  const section = NAV_SECTIONS[l1Href]
  if (!section) return null

  const forced = FORCED_L2.find((f) => f.l1Href === l1Href && f.test(pathname))
  const activeId = forced ? forced.activeId(searchParams) : (searchParams.get(section.paramKey) ?? section.defaultId)
  return { section, activeId }
}

/** L2 탭 클릭 시 이동할 href. 같은 섹션 basePath에 머무는 중이면(preserveParams) 다른 쿼리는 유지. */
export function buildL2Href(
  section: L2Section,
  tab: L2Tab,
  pathname: string,
  searchParams: URLSearchParams
): string {
  const onBasePath = pathname === section.basePath || pathname.startsWith(section.basePath + '/')
  const params = onBasePath && section.preserveParams
    ? new URLSearchParams(searchParams.toString())
    : new URLSearchParams()
  params.set(section.paramKey, tab.value)
  if (section.paramKey === 'category') params.delete('page')
  return `${section.basePath}?${params.toString()}`
}
