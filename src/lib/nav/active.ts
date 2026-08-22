import type { LucideIcon } from 'lucide-react'
import { getL2ForSection } from '@/lib/nav/taxonomy'

export interface ActiveNav {
  /** NAV_TABS의 href 문자열과 정확히 일치하는 값. 어떤 L1도 아니면 null */
  l1Href: string | null
  /** 해당 L1 섹션의 활성 L2 탭 id. L2가 없는 섹션이면 null */
  l2Id: string | null
}

export const NAV_TABS: ReadonlyArray<{
  label: string
  href: string
  exact: boolean
  icon?: LucideIcon
}> = [
  { label: '홈', href: '/dashboard', exact: true },
  { label: '핵심 인사이트', href: '/dashboard/issues', exact: false },
  { label: '키워드 분석', href: '/dashboard/issues?view=keyword', exact: false },
  { label: '기업동향', href: '/dashboard/entities', exact: false },
  { label: '관계지도', href: '/dashboard/issues?view=graph', exact: false },
  { label: '자료실', href: '/dashboard/contents', exact: false },
]

const NAV_ALIAS_PREFIXES: Record<string, string[]> = {
  '/dashboard/issues': ['/dashboard/daily-insights', '/dashboard/keywords'],
  '/dashboard/entities': ['/dashboard/insights'],
  '/dashboard/contents': ['/dashboard/reports'],
}

export const ISSUES_L1_HREFS = {
  brief: '/dashboard/issues',
  keyword: '/dashboard/issues?view=keyword',
  graph: '/dashboard/issues?view=graph',
} as const

function issuesL1HrefForView(
  view: string | null,
  fallback: keyof typeof ISSUES_L1_HREFS
): string {
  if (view === 'keyword' || view === 'graph' || view === 'brief') return ISSUES_L1_HREFS[view]
  return ISSUES_L1_HREFS[fallback]
}

export function resolveIssuesActiveHref(pathname: string, searchParams: URLSearchParams): string | null {
  if (pathname.startsWith('/dashboard/daily-insights')) return ISSUES_L1_HREFS.brief
  if (pathname.startsWith('/dashboard/keywords')) return ISSUES_L1_HREFS.keyword
  if (pathname === '/dashboard/issues' || pathname.startsWith('/dashboard/issues/')) {
    return issuesL1HrefForView(searchParams.get('view'), 'brief')
  }
  return null
}

export function isTabActive(href: string, exact: boolean, pathname: string): boolean {
  if (exact) return pathname === href
  if (pathname === href || pathname.startsWith(href + '/')) return true
  return (NAV_ALIAS_PREFIXES[href] ?? []).some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
  )
}

export function resolveActiveNav(
  pathname: string,
  searchParams: URLSearchParams,
  categoryHint: string | null = null
): ActiveNav {
  const isEntityDetailFromIssues =
    pathname.startsWith('/dashboard/entities/') && searchParams.get('origin') === 'issues'
  const isDocumentsViewFromEntities =
    pathname === '/dashboard/entities' && searchParams.get('view') === 'documents'

  const l1Href =
    resolveIssuesActiveHref(pathname, searchParams)
    ?? (isEntityDetailFromIssues ? issuesL1HrefForView(searchParams.get('view'), 'keyword') : null)
    ?? (isDocumentsViewFromEntities ? '/dashboard/contents' : null)
    ?? (NAV_TABS.find((tab) => isTabActive(tab.href, tab.exact, pathname))?.href ?? null)
  const l2 = l1Href
    ? getL2ForSection(l1Href, pathname, searchParams, categoryHint)
    : null

  return { l1Href, l2Id: l2?.activeId ?? null }
}
