'use client'

import type { ReactNode } from 'react'
import AdminTabShell from '@/components/admin/ui/AdminTabShell'
import KeywordManager from '@/components/admin/KeywordManager'
import AdminKeywordRiseAnalyze from '@/components/admin/AdminKeywordRiseAnalyze'
import KeywordGroupManager from '@/components/admin/KeywordGroupManager'
import EntityManager from '@/components/admin/EntityManager'

const DICTIONARY_TABS = [
  { value: 'keywords', label: '키워드' },
  { value: 'keyword-groups', label: '키워드 그룹·시그널 기준' },
  { value: 'taxonomy', label: '분류·카테고리' },
  { value: 'entities', label: '엔티티 사전' },
]

interface KeywordsHubProps {
  taxonomyPanel: ReactNode | null
}

/** 524 — 키워드·키워드그룹·분류/카테고리·엔티티 사전 통합(AdminTabShell 이식). taxonomy만 서버 전용 조회라 슬롯으로 전달받는다. */
export default function KeywordsHub({ taxonomyPanel }: KeywordsHubProps) {
  return (
    <AdminTabShell
      tabs={DICTIONARY_TABS}
      defaultTab="keywords"
      aria-label="사전·분류"
      renderContent={(tab) => {
        if (tab === 'keyword-groups') return <KeywordGroupManager />
        if (tab === 'taxonomy') return taxonomyPanel
        if (tab === 'entities') return <EntityManager />
        return (
          <div className="space-y-8">
            <AdminKeywordRiseAnalyze />
            <KeywordManager />
          </div>
        )
      }}
    />
  )
}
