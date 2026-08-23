import type { ReactNode } from 'react'
import AiMark from '@/components/ui/AiMark'

// ─── L2(하위 탭) 중앙 정의(372) ─────────────────────────────────────────────────
// DashboardHeader가 L1 아래 sticky L2 행을 렌더할 때 이 파일 하나만 참조한다.
// 각 섹션의 L2 항목·URL(param/value)·기본 활성 탭은 기존 InsightViewTabs 사용처
// (ContentsBoard·AiInsightBoard·AiInsightTabs·EntityTabs·ReportTabs)와 1:1 일치.

/** 397 — AI 생성물 탭 라벨. 심볼은 글자 좌측 상단에 작게 얹는다(어깨글자 형태). */
function aiLabel(text: string) {
  return (
    <span className="relative inline-block">
      <AiMark size="sm" className="absolute -left-2 -top-1.5" />
      {text}
    </span>
  )
}

export interface L2Tab {
  id: string
  label: ReactNode
  value: string
  /** 있으면 이 탭은 자기 섹션의 category/view 파라미터가 아니라 이 href로 바로 이동한다
   *  (다른 basePath의 기존 페이지를 자료실 L2 아래에 노출만 할 때 — buildL2Href가 우선 사용). */
  href?: string
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
    preserveParams: false,
    tabs: [
      { id: 'brief', label: '주간 인사이트', value: 'brief' },
      { id: 'insight-report', label: aiLabel('인사이트 리포트'), value: 'insight-report', href: '/dashboard/reports?view=ai' },
    ],
  },
  '/dashboard/issues?view=keyword': {
    l1Href: '/dashboard/issues?view=keyword',
    basePath: '/dashboard/issues',
    paramKey: 'view',
    defaultId: 'keyword',
    preserveParams: false,
    tabs: [
      { id: 'keyword', label: '키워드 분석', value: 'keyword' },
      { id: 'graph', label: '관계지도', value: 'graph' },
    ],
  },
  // '/dashboard/entities' 섹션은 제거됨(지시서 2026-08-04b) — 'documents'(기업·기술
  // 자료)는 자료실의 '기업 공시'로, 'competitor'·'trend'는 실험실로 각각 이관되어
  // 남는 탭이 'watchlist' 하나뿐이라 L2 행 자체를 없앴다. getL2ForSection이 이
  // l1Href에 대해 section을 못 찾으면 null을 반환해 L2Row가 아무것도 렌더하지
  // 않는다 — 기업동향 L1을 눌러도 바로 주요 기업 콘텐츠만 보인다. 페이지·라우트
  // (/dashboard/entities?view=watchlist|competitor|trend|documents)는 그대로 남아
  // 직접 URL 접근은 계속 동작한다.
  '/dashboard/contents': {
    l1Href: '/dashboard/contents',
    basePath: '/dashboard/contents',
    paramKey: 'category',
    defaultId: '뉴스',
    preserveParams: true,
    tabs: [
      { id: '뉴스', label: '뉴스', value: '뉴스' },
      { id: '유튜브', label: '영상', value: '유튜브' },
      { id: '웹인사이트', label: '기술 블로그', value: '웹인사이트' },
      // 아래 2개는 자료실 소속 콘텐츠가 아니라 다른 섹션의 기존 페이지로 보내는
      // 링크 탭 — href가 있으면 buildL2Href가 category 파라미터 대신 이 href를 쓴다.
      // 페이지·데이터는 그대로 두고 "어디 아래 보이느냐"만 자료실로 옮긴 것(지시서
      // 2026-08-04b/c). 상세페이지에서의 활성 L1/L2는 FORCED_L2 참고.
      //
      { id: 'consulting-report', label: '전문기관 보고서', value: 'consulting-report', href: '/dashboard/reports?view=external' },
      { id: 'disclosure', label: '기업 공시', value: 'disclosure', href: '/dashboard/entities?view=documents' },
    ],
  },
}

// ─── 라우트별 강제 활성 탭(기존 페이지의 value prop 하드코딩과 1:1) ───────────────
// l1Href가 호출 측에서 이미 결정돼 넘어오므로, 여기서는 pathname만으로 판정한다.
const FORCED_L2: {
  test: (pathname: string, categoryHint?: string | null) => boolean
  l1Href: string
  activeId: (searchParams: URLSearchParams, categoryHint?: string | null) => string
}[] = [
  // '/dashboard/entities'·'/dashboard/issues' 섹션 자체가 NAV_SECTIONS에서
  // 제거되어(위 참고) 이 l1Href들을 향한 항목은 이제 전부 무의미하다
  // (getL2ForSection이 section을 못 찾아 바로 null 반환 — activeId까지 도달 안
  // 함). 경쟁사 주간 브리핑 상세·기업 상세(단건)에 대한 옛 entities L2 강제
  // 매핑, 기업 상세(origin=issues)·일간 인사이트 상세·키워드 상세에 대한 옛
  // issues L2 강제 매핑은 그래서 전부 제거했다 — 이 라우트들의 L1 판정은 이제
  // DashboardHeader.tsx가 직접 한다.
  //
  // 콘텐츠 상세(/dashboard/contents/[id])가 지식보고서인 경우 — 인사이트 L1의
  // "인사이트 리포트" 탭이 활성이어야 한다. categoryHint는 링크의 ?category= 쿼리파라미터
  // (첫 렌더부터 확정, 우선)이거나 그게 없을 때 RecordActiveCategoryHint가 mount
  // 시 알려주는 값(폴백)이다.
  {
    test: (p, cat) => /^\/dashboard\/contents\/[^/]+$/.test(p) && cat === '지식보고서',
    l1Href: '/dashboard/issues',
    activeId: () => 'insight-report',
  },
  // 콘텐츠 상세가 외부 리포트(리포트/가트너/KRG)인 경우 — 자료실 L1의 "전문기관 보고서"
  // 탭이 활성이어야 한다(지시서 2026-08-04b). l1Href가 '/dashboard/contents'라
  // DashboardHeader의 기본 매칭(경로 접두사)과도 일치한다.
  {
    test: (p, cat) => /^\/dashboard\/contents\/[^/]+$/.test(p) && ['리포트', '가트너', 'KRG'].includes(cat ?? ''),
    l1Href: '/dashboard/contents',
    activeId: () => 'consulting-report',
  },
  // 콘텐츠 상세가 기업·기술 자료(기업자료)인 경우 — 자료실 L1의 "기업 공시" 탭이
  // 활성이어야 한다(지시서 2026-08-04b). L1은 이미 기본 매칭으로 자료실이라 여기서는
  // L2만 강제한다.
  {
    test: (p, cat) => /^\/dashboard\/contents\/[^/]+$/.test(p) && cat === '기업자료',
    l1Href: '/dashboard/contents',
    activeId: () => 'disclosure',
  },
  // 전략보고서 목록·상세는 인사이트의 "인사이트 리포트"로 활성화한다.
  {
    test: (p) => p.startsWith('/dashboard/reports'),
    l1Href: '/dashboard/issues',
    activeId: () => 'insight-report',
  },
  // 외부 리포트 목록만 자료실의 "전문기관 보고서"로 활성화한다.
  {
    test: (p) => p === '/dashboard/reports',
    l1Href: '/dashboard/contents',
    activeId: () => 'consulting-report',
  },
  // /dashboard/entities?view=documents(기업·기술 자료 목록) — 자료실의 "기업 공시"
  // 탭으로 이관된 화면(지시서 2026-08-04b). resolveActiveNav가 이 경로+view일 때만
  // l1Href를 '/dashboard/contents'로 강제하므로 여기
  // 도달 시점엔 항상 documents 뷰라 pathname만으로 판정해도 안전하다.
  {
    test: (p) => p === '/dashboard/entities',
    l1Href: '/dashboard/contents',
    activeId: () => 'disclosure',
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
  searchParams: URLSearchParams,
  categoryHint: string | null = null
): ActiveL2 | null {
  const section = NAV_SECTIONS[l1Href]
  if (!section) return null

  const forced = FORCED_L2.find((f) => f.l1Href === l1Href && f.test(pathname, categoryHint))
  const activeId = forced
    ? forced.activeId(searchParams, categoryHint)
    : (searchParams.get(section.paramKey) ?? section.defaultId)
  return { section, activeId }
}

/** L2 탭 클릭 시 이동할 href. 같은 섹션 basePath에 머무는 중이면(preserveParams) 다른 쿼리는 유지. */
export function buildL2Href(
  section: L2Section,
  tab: L2Tab,
  pathname: string,
  searchParams: URLSearchParams
): string {
  // 다른 섹션의 기존 페이지로 보내는 링크 탭(예: 자료실 아래 "전문기관 보고서")은
  // 이 섹션의 paramKey/basePath 조합이 아니라 자기 href로 바로 보낸다.
  if (tab.href) return tab.href
  const onBasePath = pathname === section.basePath || pathname.startsWith(section.basePath + '/')
  const params = onBasePath && section.preserveParams
    ? new URLSearchParams(searchParams.toString())
    : new URLSearchParams()
  params.set(section.paramKey, tab.value)
  if (section.paramKey === 'category') params.delete('page')
  return `${section.basePath}?${params.toString()}`
}
