import type { LucideIcon } from 'lucide-react'
import type { AdminCapability } from '@/lib/admin/capabilities'
import {
  LayoutDashboard,
  Newspaper,
  Sun,
  Rss,
  Tags,
  Network,
  Sparkles,
  Mail,
  Users,
  Settings,
  TrendingUp,
  FileText,
  History,
  KeyRound,
  FileArchive,
  AlertTriangle,
  BarChart3,
  Building2,
  Landmark,
  UserCheck,
  FlaskConical,
} from 'lucide-react'

export interface AdminNavItem {
  href: string
  label: string
  description: string
  icon: LucideIcon
  disabled?: boolean
  badge?: string
  roadmap?: string
  external?: boolean
  /** 이 능력이 없는 역할에게는 자물쇠 비활성으로 보인다(숨기지 않는다). */
  capability?: AdminCapability
}

export interface AdminNavGroup {
  group: string
  items: AdminNavItem[]
}

// 504 — 어드민 IA 1단계: 그룹 11개 → 8개 배치 재편(항목 통합은 2단계).
// 522 — 어드민 IA 2단계: 8개 → 6개로 재배치. href 는 전부 그대로다 — 여기서는
// 어느 그룹에 어떤 라벨로 노출되는지만 바뀐다.
// 524 — 어드민 IA 3단계: AdminTabShell 이식으로 4건(3~4개 항목→1개 탭 화면) 통합.
// 통합된 항목의 href 는 사라지고 대표 href 하나로 합쳐진다. 옛 경로는 리다이렉트 스텁으로 남는다.
export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    group: '운영',
    items: [
      { href: '/admin', label: '운영 대시보드', description: '전체 운영 현황, 사용자 수, 콘텐츠 상태, AI/발행 상태를 요약합니다.', icon: LayoutDashboard },
    ],
  },
  {
    group: '수집',
    items: [
      // 522 — 콘텐츠 그룹 해체, 수집으로 이동.
      { href: '/admin/contents', label: '콘텐츠', description: '뉴스·웹인사이트·유튜브·외부리포트 콘텐츠를 탭별로 관리합니다.', icon: Newspaper },
      { href: '/admin/sources', label: '소스 관리', description: '소스 목록, 수집 설정, 제외 규칙과 콘텐츠 보강 작업을 통합 관리합니다.', icon: Rss },
      { href: '/admin/keywords', label: '키워드', description: '분류 키워드, 수집 키워드그룹·시그널 기준과 관계지도 사전을 통합 관리합니다.', icon: Tags },
    ],
  },
  {
    group: '발행',
    items: [
      { href: '/admin/reports', label: 'AI 리포트', description: 'AI 리포트 생성·발행과 프롬프트 편집을 통합 관리합니다.', icon: FileText },
      { href: '/admin/knowledge-reports', label: '지식보고서', description: '내부 지식보고서 작성·업로드·발행 정보 관리.', icon: FileText },
      { href: '/admin/briefings', label: '모닝브리핑', description: '데일리 브리핑·TTS 오디오·하이라이트 생성 관리.', icon: Sun },
      { href: '/admin/newsletter', label: '뉴스레터', description: '뉴스레터 발행·설정·수신자·구독자·발송 이력을 통합 관리합니다.', icon: Mail },
      // 504A — "이슈 관리"에서 개명. 실제 소비처는 홈의 "오늘의 급상승 뉴스"
      // (IssueSignals → trending_keywords 뷰 → issues + issue_contents 조인)라 옛 이름이
      // 역할을 가렸다. 발행 그룹에 둔다. 경로(/admin/issues)는 그대로.
      { href: '/admin/issues', label: '급상승 뉴스', description: '홈 화면 "오늘의 급상승 뉴스"에 노출되는 이슈 생성·발행·키워드 매칭·콘텐츠 배정을 관리합니다.', icon: TrendingUp },
      // 522 — 인사이트 그룹 해체, 발행으로 이동.
      { href: '/admin/daily-insights', label: '핵심 인사이트', description: '주 1회(월요일) 생성되는 핵심 인사이트를 검토·편집·반려합니다.', icon: Sun },
    ],
  },
  {
    group: '기업동향',
    items: [
      { href: '/admin/insights', label: '기업 주간 시사점', description: '생성·검수·발행한 카드가 서비스 기업동향의 \'LG U+ 시사점\'으로 노출됩니다.', icon: Sparkles },
      { href: '/admin/companies', label: '주요기업', description: '서비스 기업동향에 노출되는 주요기업·그룹을 관리합니다.', icon: Building2 },
      { href: '/admin/company-documents', label: '기업자료 수집', description: '등록 기업의 DART 공시 수집·적재.', roadmap: '주요기업>기업자료로 이동 예정(S8).', icon: FileArchive },
      { href: '/admin/relations', label: '관계 그래프', description: '엔티티 동시출현 관계와 근거 콘텐츠를 그래프로 탐색합니다.', icon: Network },
      { href: '/admin/disclosures', label: '기업공시', description: '주요기업·경쟁사 공시 수집·콘텐츠화.', roadmap: '(도입 예정)', icon: Landmark, disabled: true, badge: '도입 예정' },
      // 522 — 실험실에서 이동. 생성 화면(/admin/competitor-weekly/generate)은 실험실에 남긴다.
      { href: '/admin/competitor-weekly', label: '경쟁사 주간 브리핑', description: '사업영역별 주간 브리핑 발행 목록.', icon: FileText },
    ],
  },
  {
    group: '분석·관리',
    items: [
      { href: '/admin/analytics/publish', label: '발행 분석', description: 'AI 리포트·모닝브리핑·뉴스레터·경쟁사 주간 브리핑의 발행 현황을 분석합니다.', icon: BarChart3 },
      { href: '/admin/analytics/users', label: '사용자 분석', description: 'DAU/WAU/MAU·조직별 활성·기능 이용률·검색/북마크.', roadmap: '(준비중 — S9)', icon: BarChart3, disabled: true, badge: '준비중' },
      // 522 — 인사이트 그룹 해체 시 분석 성격이 강해 여기로 배치(지시서 미명시 항목).
      { href: '/admin/keyword-analysis', label: '키워드분석', description: '키워드 언급량·시그널 분석 결과 검수·노출 설정. (준비중)', icon: BarChart3, disabled: true, badge: '준비중' },
      { href: '/admin/users', label: '사용자', description: '사용자 승인 상태·역할·부서·팀 정보를 관리합니다.', icon: Users, capability: 'manage_admins' },
      { href: '/admin/organizations', label: '조직', description: '조직 등록·조직별 사용량·활성 사용자 관리.', roadmap: '(준비중 — S10)', icon: Building2, disabled: true, badge: '준비중' },
      { href: '/admin/approvals', label: '초대·가입 승인', description: '초대·가입 허용목록·승인 워크플로우.', roadmap: '(준비중 — S10)', icon: UserCheck, disabled: true, badge: '준비중' },
      { href: '/admin/roles', label: '역할·권한', description: '역할 기반 접근 권한 관리.', roadmap: '(준비중 — S10)', icon: KeyRound, disabled: true, badge: '준비중' },
      // 531 — 운영 그룹에서 분석·관리로 이동. 화면과 탭 구조는 그대로 유지한다.
      { href: '/admin/job-runs', label: '실행 이력', description: '크론·일괄 작업 이력, 관리자 감사 로그, 수집 기술 로그를 통합 조회합니다.', icon: History },
      { href: '/admin/settings', label: '시스템 설정', description: '공통 환경·AI 모델·외부 API·MCP 토큰·시스템 유지보수를 통합 관리합니다.', icon: Settings },
      { href: '/admin/errors', label: '작업·오류 센터', description: '수집·본문추출·AI생성·번역/TTS·발행 실패를 모아 재실행합니다.', roadmap: '(준비중 — S9)', icon: AlertTriangle, disabled: true, badge: '준비중' },
    ],
  },
  {
    group: '실험실',
    items: [
      // 522 — "경쟁사 주간 브리핑"은 기업동향으로 이동, 생성 화면은 부모 없이 여기 남는다.
      { href: '/admin/competitor-weekly/generate', label: '주간 브리핑 생성', description: '사실 추출 → 분석 2단계로 새 브리핑을 만듭니다.', icon: Sparkles },
      { href: '/admin/competitors', label: '경쟁사동향', description: '경쟁사 최근 뉴스 수집·선별·노출.', roadmap: '(준비중 — S8)', icon: TrendingUp, disabled: true, badge: '준비중' },
      { href: '/dashboard/lab', label: '사용자 실험실', description: '사용자 화면의 실험 기능과 프로토타입을 확인합니다.', icon: FlaskConical, external: true },
    ],
  },
]

/** href 문자열을 pathname/쿼리로 분해 */
function splitHref(href: string): { pathname: string; params: URLSearchParams } {
  const [pathname, qs = ''] = href.split('?')
  return { pathname, params: new URLSearchParams(qs) }
}

/** href의 쿼리 조건을 현재 검색 파라미터가 모두 만족하는가 */
function queryMatches(href: string, search?: URLSearchParams | null): boolean {
  const { params } = splitHref(href)
  for (const [k, v] of params) {
    if ((search?.get(k) ?? null) !== v) return false
  }
  return true
}

/** pathname(+선택적 쿼리) → nav 항목 조회. 정확 일치 우선, 없으면 최장 startsWith 매칭 */
export function findAdminNavItem(pathname: string, search?: URLSearchParams | null): AdminNavItem | null {
  const all = ADMIN_NAV_GROUPS.flatMap(g => g.items)
  // 1) pathname 정확일치 + 쿼리 조건 만족 (쿼리 있는 항목 우선)
  const exact = all
    .filter(i => splitHref(i.href).pathname === pathname && queryMatches(i.href, search))
    .sort((a, b) => splitHref(b.href).params.size - splitHref(a.href).params.size)[0]
  if (exact) return exact
  // 2) 폴백: pathname 최장 startsWith (기존 동작)
  return all
    .filter(i => {
      const p = splitHref(i.href).pathname
      return p !== '/admin' && pathname.startsWith(p)
    })
    .sort((a, b) => splitHref(b.href).pathname.length - splitHref(a.href).pathname.length)[0] ?? null
}

/** pathname(+선택적 쿼리) → { 그룹명, 항목 }. 브레드크럼용. */
export function findAdminNavLocation(
  pathname: string,
  search?: URLSearchParams | null,
): { group: string; item: AdminNavItem } | null {
  const item = findAdminNavItem(pathname, search)
  if (!item) return null
  const group = ADMIN_NAV_GROUPS.find(g => g.items.includes(item))
  return group ? { group: group.group, item } : null
}
