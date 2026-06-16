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
  Mail,
  Users,
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
    group: '개요',
    items: [
      {
        href: '/admin',
        label: '대시보드',
        description: '수집·검토·참여 현황 한눈에',
        icon: LayoutDashboard,
      },
    ],
  },
  {
    group: '콘텐츠',
    items: [
      {
        href: '/admin/contents',
        label: '콘텐츠 관리',
        description: '수집 콘텐츠 노출·숨김·삭제',
        icon: Newspaper,
      },
      {
        href: '/admin/upload',
        label: '콘텐츠 추가',
        description: '파일 업로드 또는 텍스트 붙여넣기',
        icon: FilePlus,
      },
      {
        href: '/admin/briefings',
        label: '모닝브리핑',
        description: '자동 생성 브리핑 관리',
        icon: Sun,
      },
    ],
  },
  {
    group: '수집',
    items: [
      {
        href: '/admin/sources',
        label: '소스 관리',
        description: 'RSS와 수집 소스 설정',
        icon: Rss,
      },
      {
        href: '/admin/crawl-logs',
        label: '크롤링 현황',
        description: '자동 수집 결과와 오류 확인',
        icon: ListChecks,
      },
    ],
  },
  {
    group: '분류 엔진',
    items: [
      {
        href: '/admin/keywords',
        label: '서비스 키워드',
        description: '서비스별 자동 태깅 키워드',
        icon: Tags,
      },
      {
        href: '/admin/keyword-groups',
        label: '토픽 규칙',
        description: '관련 키워드 그룹·해시태그',
        icon: Network,
      },
    ],
  },
  {
    group: 'AI·처리',
    items: [
      {
        href: '/admin/translation',
        label: '번역',
        description: '번역 연결 상태와 월간 사용량',
        icon: Languages,
      },
      {
        href: '#',
        label: 'LLM 라우팅',
        description: 'LLM 모델·라우팅 관리',
        icon: Cpu,
        disabled: true,
        badge: '예정',
      },
    ],
  },
  {
    group: '발행',
    items: [
      {
        href: '/admin/newsletter',
        label: '뉴스레터',
        description: '발송 설정·이력·수신자 관리',
        icon: Mail,
      },
    ],
  },
]

export const ADMIN_NAV_BOTTOM: AdminNavGroup = {
  group: '시스템',
  items: [
    {
      href: '/admin/users',
      label: '사용자 관리',
      description: '사용자 목록과 권한 관리',
      icon: Users,
    },
  ],
}
