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
  Radar,
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
  CalendarClock,
  History,
  KeyRound,
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

// 지시서 278 — 어드민 IA v2 Phase 1: 8그룹 평탄화(기존 7그룹 + 하단 접이식 '시스템' 해체)
export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    group: '운영센터',
    items: [
      {
        href: '/admin',
        label: '운영 대시보드',
        description: '전체 운영 현황, 사용자 수, 콘텐츠 상태, AI/발행 상태를 요약합니다.',
        icon: LayoutDashboard,
      },
      {
        href: '/admin/requests',
        label: '운영 게시판',
        description: '운영 요청, 작업 메모, 공지, 핸드오프를 관리합니다.',
        icon: ClipboardList,
      },
      {
        href: '/admin/job-runs',
        label: '작업 이력',
        description: '크론·일괄 작업의 실행 기록과 실패를 확인합니다.',
        icon: History,
      },
    ],
  },
  {
    group: '수집·크롤링',
    items: [
      {
        href: '/admin/sources',
        label: '소스 관리',
        description: '뉴스, 유튜브, 리포트 등 콘텐츠 수집 소스를 등록하고 관리합니다.',
        icon: Rss,
      },
      {
        href: '/admin/crawl-logs',
        label: '크롤 실행 로그',
        description: '소스별 크롤 성공/실패, 수집량, 중복, 오류를 확인합니다.',
        icon: ListChecks,
      },
      {
        href: '/admin/exclusion-rules',
        label: '제외 규칙',
        description: '수집 제외 도메인, 키워드, URL 규칙을 관리합니다.',
        icon: Ban,
      },
      {
        href: '/admin/source-quality',
        label: '소스 품질',
        description: '소스별 수집 상태·품질 지표를 확인하고 크롤을 실행합니다.',
        icon: Gauge,
      },
      {
        href: '/admin/crawl-settings',
        label: '수집 설정',
        description: '크롤 수집 시 적용되는 품질 기준(최소 본문 길이)을 조정합니다.',
        icon: Filter,
      },
    ],
  },
  {
    group: '콘텐츠·분류',
    items: [
      {
        href: '/admin/contents',
        label: '콘텐츠 검수',
        description: '수집·업로드된 콘텐츠의 상태, 품질, 발행 여부를 검수합니다.',
        icon: Newspaper,
      },
      {
        href: '/admin/upload',
        label: '콘텐츠 추가',
        description: '리포트 업로드, 텍스트 붙여넣기, URL 가져오기로 콘텐츠를 수동 등록합니다.',
        icon: FilePlus,
      },
      {
        href: '/admin/keywords',
        label: '키워드',
        description: '콘텐츠 서비스/카테고리 분류 기준 키워드를 관리합니다.',
        icon: Tags,
      },
      {
        href: '/admin/keyword-groups',
        label: '키워드 그룹·시그널 기준',
        description: '수집 seed, 검색 seed, include/exclude pattern, 시그널 기준을 관리합니다.',
        icon: Network,
      },
      {
        href: '/admin/entities',
        label: '엔티티 사전',
        description: '기업, 조직, 인물 등 엔티티와 별칭, 정규화 기준을 관리합니다.',
        icon: Boxes,
      },
      // Phase 3 후보(신규 route 아님, 문서 TODO): 큐레이션 기업 화면 — ADMIN_RESTRUCTURE_PLAN.md 참고
    ],
  },
  {
    group: 'AI 운영',
    items: [
      {
        href: '/admin/llm',
        label: 'LLM 관리',
        description: 'LLM 공급자, 사용량, 모델, 라우팅 상태를 확인합니다.',
        icon: Cpu,
      },
      {
        href: '/admin/translation',
        label: '번역 관리',
        description: '번역 공급자 상태와 번역 사용량을 확인합니다.',
        icon: Languages,
      },
      {
        href: '/admin/ai-jobs',
        label: '일괄 작업 관리',
        description: '콘텐츠의 AI 분석, 데이터 보강, 재수집·재처리 작업을 실행하고 진행 상태를 관리합니다.',
        icon: Wrench,
      },
      // Phase 2/3 후보(신규 route 아님, 문서 TODO): 프롬프트 관리 — ADMIN_RESTRUCTURE_PLAN.md 참고
    ],
  },
  {
    group: '인사이트·리서치',
    items: [
      {
        href: '/admin/issues',
        label: '이슈 관리',
        description: '주요 이슈 클러스터와 관련 콘텐츠 매칭을 관리합니다.',
        icon: Radar,
      },
      {
        href: '/admin/insights',
        label: '인사이트 카드',
        description: 'AI가 생성한 인사이트 카드의 생성, 검수, 발행 상태를 관리합니다.',
        icon: Sparkles,
      },
      {
        href: '/admin/daily-insights',
        label: '일일 핵심 Insight',
        description: '자동 게시된 일일 핵심 Insight를 사후 검토·편집·반려합니다.',
        icon: CalendarClock,
      },
      {
        href: '/admin/competitor-weekly',
        label: '경쟁사 주간 리포트',
        description: '경쟁사 동향을 사업영역별로 종합한 주간 리포트를 생성·확인합니다.',
        icon: TrendingUp,
      },
      {
        href: '/admin/reports',
        label: '전략보고서 관리',
        description: '전략보고서 생성·재생성·표지·발행자/발행일 HITL 발행 워크플로우를 관리합니다.',
        icon: FileText,
      },
    ],
  },
  {
    group: '발행·구독',
    items: [
      {
        href: '/admin/briefings',
        label: '모닝브리핑',
        description: '데일리 브리핑, TTS 오디오, 하이라이트 생성 상태를 관리합니다.',
        icon: Sun,
      },
      {
        href: '/admin/newsletter',
        label: '뉴스레터',
        description: '뉴스레터 발행, 설정, 수신자, 구독자, 발송 이력을 통합 관리합니다.',
        icon: Mail,
      },
    ],
  },
  {
    group: '사용자·분석',
    items: [
      {
        href: '/admin/users',
        label: '사용자 관리',
        description: '사용자 승인 상태, 역할, 부서, 팀 정보를 관리합니다.',
        icon: Users,
      },
      // Phase 2/3 후보(신규 route 아님, 문서 TODO): 분석 — ADMIN_RESTRUCTURE_PLAN.md 참고
    ],
  },
  {
    group: '시스템 설정',
    items: [
      {
        href: '/admin/settings',
        label: '시스템 설정',
        description: '어드민 콘솔 화면 테마·폰트·색상을 설정합니다.',
        icon: Settings,
      },
      {
        href: '/admin/homepage-sections',
        label: '홈 화면 구성',
        description: '방문자에게 보이는 홈 화면의 항목과 순서를 관리합니다.',
        icon: LayoutTemplate,
      },
      {
        href: '/admin/mcp',
        label: 'MCP 토큰',
        description: '팀원이 각자의 Claude에서 인사이트 아웃에 기록할 수 있도록 토큰을 발급·폐기합니다.',
        icon: KeyRound,
      },
      {
        href: '/admin/maintenance',
        label: '시스템 유지보수',
        description: '되돌릴 수 없는 수집 데이터 삭제·초기화 작업을 관리합니다.',
        icon: ShieldAlert,
      },
      // Phase 2/3 후보(신규 route 아님, 문서 TODO): 작업 모니터, 장애로그, 서비스카탈로그 — ADMIN_RESTRUCTURE_PLAN.md 참고
    ],
  },
]

/** pathname → nav 항목 조회. 정확 일치 우선, 없으면 최장 startsWith 매칭 */
export function findAdminNavItem(pathname: string): AdminNavItem | null {
  const all = ADMIN_NAV_GROUPS.flatMap(g => g.items)
  const exact = all.find(i => i.href === pathname)
  if (exact) return exact
  return all
    .filter(i => i.href !== '/admin' && pathname.startsWith(i.href))
    .sort((a, b) => b.href.length - a.href.length)[0] ?? null
}
