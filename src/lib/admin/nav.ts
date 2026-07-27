import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Newspaper,
  FilePlus,
  Sun,
  Rss,
  ListChecks,
  Languages,
  Tags,
  Network,
  Cpu,
  Sparkles,
  Mail,
  Users,
  Boxes,
  ClipboardList,
  Ban,
  Settings,
  Wrench,
  TrendingUp,
  ShieldAlert,
  Filter,
  Gauge,
  LayoutTemplate,
  FileText,
  History,
  KeyRound,
  FileArchive,
  AlertTriangle,
  BarChart3,
  Building2,
  Landmark,
  Globe,
  Video,
  FolderTree,
  UserCheck,
} from 'lucide-react'

export interface AdminNavItem {
  href: string
  label: string
  description: string
  icon: LucideIcon
  disabled?: boolean
  badge?: string
}

export interface AdminNavGroup {
  group: string
  items: AdminNavItem[]
}

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    group: '운영센터',
    items: [
      { href: '/admin', label: '운영 대시보드', description: '전체 운영 현황, 사용자 수, 콘텐츠 상태, AI/발행 상태를 요약합니다.', icon: LayoutDashboard },
      { href: '/admin/ops-issues', label: '운영 이슈', description: '자동 탐지된 운영 이슈(수집·크론·사용량·보강) 확인·상태 관리.', icon: AlertTriangle },
      { href: '/admin/errors', label: '작업·오류 센터', description: '수집·본문추출·AI생성·번역/TTS·발행 실패를 모아 재실행합니다. (준비중 — S9)', icon: AlertTriangle, disabled: true, badge: '준비중' },
      { href: '/admin/job-runs', label: '작업 이력', description: '크론·일괄 작업의 실행 기록과 실패를 확인합니다.', icon: History },
      { href: '/admin/requests', label: '운영 게시판', description: '운영 요청, 작업 메모, 공지, 핸드오프를 관리합니다.', icon: ClipboardList },
    ],
  },
  {
    group: '홈',
    items: [
      { href: '/admin/homepage-sections', label: '홈 화면 구성', description: '방문자에게 보이는 홈 화면의 항목과 순서를 관리합니다.', icon: LayoutTemplate },
    ],
  },
  {
    group: '인사이트',
    items: [
      { href: '/admin/insights', label: '인사이트 카드', description: 'AI 인사이트 카드 생성·검수·발행.', icon: Sparkles },
      { href: '/admin/issues', label: '이슈 관리', description: '이슈 생성·발행·키워드 매칭·콘텐츠 배정.', icon: TrendingUp },
      { href: '/admin/daily-insights', label: '일일 핵심', description: '자동 게시된 일일 핵심 검토·편집·반려.', icon: Sun },
      { href: '/admin/keyword-analysis', label: '키워드분석', description: '키워드 언급량·시그널 분석 결과 검수·노출 설정. (준비중)', icon: BarChart3, disabled: true, badge: '준비중' },
      { href: '/admin/relations', label: '관계지도', description: '엔티티 동시출현 관계·근거 콘텐츠 탐색.', icon: Network },
    ],
  },
  {
    group: '기업동향',
    items: [
      { href: '/admin/companies', label: '주요기업', description: '주요기업 목록·프로필·기업별 콘텐츠 관리. (준비중 — S8)', icon: Building2, disabled: true, badge: '준비중' },
      { href: '/admin/competitors', label: '경쟁사동향', description: '경쟁사 최근 뉴스 수집·선별·노출. (준비중 — S8)', icon: TrendingUp, disabled: true, badge: '준비중' },
      { href: '/admin/competitor-weekly', label: '경쟁사 주간 브리핑', description: '사업영역별 주간 브리핑 발행 목록.', icon: FileText },
      { href: '/admin/competitor-weekly/generate', label: '주간 브리핑 생성', description: '사실 추출 → 분석 2단계로 새 브리핑을 만듭니다.', icon: Sparkles },
      { href: '/admin/company-documents', label: '기업자료 수집', description: '등록 기업의 DART 공시 수집·적재. 주요기업>기업자료로 이동 예정(S8).', icon: FileArchive },
      { href: '/admin/disclosures', label: '기업공시', description: '주요기업·경쟁사 공시 수집·콘텐츠화. (도입 예정)', icon: Landmark, disabled: true, badge: '도입 예정' },
    ],
  },
  {
    group: '콘텐츠',
    items: [
      { href: '/admin/contents?category=뉴스', label: '뉴스', description: '뉴스 콘텐츠 수집·검수·발행을 관리합니다.', icon: Newspaper },
      { href: '/admin/contents?category=웹인사이트', label: '웹인사이트', description: '전문기관·기업 블로그 등 고부가 콘텐츠를 관리합니다.', icon: Globe },
      { href: '/admin/contents?category=유튜브', label: '유튜브', description: '채널·영상 콘텐츠와 자막·요약을 관리합니다.', icon: Video },
      { href: '/admin/upload', label: '콘텐츠 추가', description: '리포트 업로드·텍스트 붙여넣기·URL 가져오기로 수동 등록. 각 콘텐츠 등록으로 이동 예정(S4).', icon: FilePlus },
      { href: '/admin/sources', label: '소스 관리', description: '콘텐츠 소스 전체 목록·순서 관리. 타입별 관리는 각 콘텐츠 화면의 소스 탭에서.', icon: Rss },
      { href: '/admin/crawl-settings', label: '수집 설정', description: '크롤 수집 품질 기준(최소 본문 길이). 각 콘텐츠 수집 설정으로 이동 예정(S4).', icon: Filter },
      { href: '/admin/enrich', label: '데이터 보강 재처리', description: '누락 본문·URL·썸네일·자막·표지·태그 재처리. 콘텐츠 탭/작업·오류센터로 이동 예정(S4).', icon: Wrench },
    ],
  },
  {
    group: '리포트',
    items: [
      { href: '/admin/reports', label: 'AI 리포트', description: '전략보고서 생성·재생성·표지·HITL 발행. 프롬프트·AI보강 결합 예정(S7).', icon: FileText },
      { href: '/admin/contents?category=외부리포트', label: '외부리포트', description: '외부 PDF·PPT·문서 리포트를 등록·발행합니다.', icon: FileArchive },
      { href: '/admin/knowledge-reports', label: '지식보고서', description: '내부 지식보고서 작성·업로드·발행 정보 관리.', icon: FileText },
      { href: '/admin/briefings', label: '모닝브리핑', description: '데일리 브리핑·TTS 오디오·하이라이트 생성 관리.', icon: Sun },
      { href: '/admin/prompts', label: '프롬프트 콘솔', description: 'AI 생성기 프롬프트 편집·저장. AI 리포트>프롬프트 탭으로 통합 예정(S7).', icon: Sparkles },
      { href: '/admin/ai-jobs', label: 'AI 콘텐츠 보강', description: '논조·위기기회·요약·신호분류 등 LLM 작업 실행. 콘텐츠/리포트 탭으로 통합 예정(S7).', icon: Cpu },
    ],
  },
  {
    group: '발행·구독',
    items: [
      { href: '/admin/newsletter', label: '뉴스레터', description: '뉴스레터 발행·설정·수신자·구독자·발송 이력을 통합 관리합니다.', icon: Mail },
    ],
  },
  {
    group: '기준정보',
    items: [
      { href: '/admin/keywords', label: '키워드', description: '콘텐츠 서비스/카테고리 분류 기준 키워드 원장을 관리합니다.', icon: Tags },
      { href: '/admin/keyword-groups', label: '키워드 그룹·시그널 기준', description: '수집 seed, 검색 seed, include/exclude pattern, 시그널 기준을 관리합니다.', icon: Network },
      { href: '/admin/entities', label: '엔티티 사전', description: '기업·조직·인물 등 엔티티와 별칭·정규화 기준을 관리합니다.', icon: Boxes },
      { href: '/admin/taxonomy', label: '분류·카테고리', description: 'DB 카테고리와 사용자 화면·어드민 탭 매핑을 조회합니다. (조회 전용)', icon: FolderTree },
      { href: '/admin/exclusion-rules', label: '제외 규칙', description: '수집 제외 도메인·키워드·URL, 중복·저품질 기준을 관리합니다.', icon: Ban },
    ],
  },
  {
    group: '통계분석',
    items: [
      { href: '/admin/analytics/content', label: '콘텐츠 분석', description: '콘텐츠 수집 추이·카테고리·상태·소스·북마크 성과.', icon: BarChart3 },
      { href: '/admin/source-quality', label: '수집 분석', description: '소스별 수집량·성공률·본문추출률·중복률·오류율. (현행 소스 품질 → 확장 예정 S9)', icon: Gauge },
      { href: '/admin/analytics/publish', label: '발행 분석', description: '발행량 추이·생성/발행 성공률·검수 소요·뉴스레터 성과.', icon: BarChart3 },
      { href: '/admin/analytics/users', label: '사용자 분석', description: 'DAU/WAU/MAU·조직별 활성·기능 이용률·검색/북마크. (준비중 — S9)', icon: BarChart3, disabled: true, badge: '준비중' },
      { href: '/admin/analytics/ai-cost', label: 'AI 사용량·비용', description: 'LLM·번역·TTS 월별 사용량과 한도 대비 소진율.', icon: Cpu },
      { href: '/admin/crawl-logs', label: '로그 분석', description: '기술 로그 검색·오류 추세·연관 실행 이력. (현행 크롤 로그 → 확장 예정 S9)', icon: ListChecks },
    ],
  },
  {
    group: '사용자 관리',
    items: [
      { href: '/admin/users', label: '사용자', description: '사용자 승인 상태·역할·부서·팀 정보를 관리합니다.', icon: Users },
      { href: '/admin/organizations', label: '조직', description: '조직 등록·조직별 사용량·활성 사용자 관리. (준비중 — S10)', icon: Building2, disabled: true, badge: '준비중' },
      { href: '/admin/approvals', label: '초대·가입 승인', description: '초대·가입 허용목록·승인 워크플로우. (준비중 — S10)', icon: UserCheck, disabled: true, badge: '준비중' },
      { href: '/admin/roles', label: '역할·권한', description: '역할 기반 접근 권한 관리. (준비중 — S10)', icon: KeyRound, disabled: true, badge: '준비중' },
    ],
  },
  {
    group: '시스템 설정',
    items: [
      { href: '/admin/llm', label: 'AI 모델·프로바이더', description: '전역 AI 자원(제공자·모델·라우팅·단가·한도)을 등록·관리합니다.', icon: Cpu },
      { href: '/admin/translation', label: '외부 API·연동', description: '번역·TTS·검색·메일·스토리지 등 외부 연동. 외부 API·연동으로 확장 예정(S6).', icon: Languages },
      { href: '/admin/mcp', label: 'MCP 토큰', description: '팀원이 각자의 Claude에서 기록할 수 있도록 토큰을 발급·폐기합니다.', icon: KeyRound },
      { href: '/admin/settings', label: '공통 환경설정', description: '어드민 화면 테마·서비스 기본값·알림·발행 정책·보안. 확장 예정(S6).', icon: Settings },
      { href: '/admin/maintenance', label: '시스템 유지보수', description: '되돌릴 수 없는 수집 데이터 삭제·초기화·백업 작업을 관리합니다.', icon: ShieldAlert },
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
