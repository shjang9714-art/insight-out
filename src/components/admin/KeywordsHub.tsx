'use client'

import AdminTabShell from '@/components/admin/ui/AdminTabShell'
import KeywordManager from '@/components/admin/KeywordManager'
import AdminKeywordRiseAnalyze from '@/components/admin/AdminKeywordRiseAnalyze'
import KeywordGroupManager from '@/components/admin/KeywordGroupManager'
import EntityManager from '@/components/admin/EntityManager'

const DICTIONARY_TABS = [
  { value: 'keywords', label: '키워드' },
  { value: 'keyword-groups', label: '키워드 그룹·시그널 기준' },
  { value: 'entities', label: '관계지도 사전' },
]

export default function KeywordsHub() {
  return (
    <AdminTabShell
      tabs={DICTIONARY_TABS}
      defaultTab="keywords"
      aria-label="키워드"
      renderContent={(tab) => {
        if (tab === 'keyword-groups') return <KeywordGroupManager />
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
