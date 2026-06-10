'use client'

import { Suspense } from 'react'
import RecentFeed from '@/components/dashboard/RecentFeed'
import EmailArchiveWidget from '@/components/dashboard/EmailArchiveWidget'

function DashboardContent() {
  return (
    <div className="px-4 py-6 sm:px-5">
      <div className="space-y-6">
        <EmailArchiveWidget />
        <RecentFeed />
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">로딩 중...</div>}>
      <DashboardContent />
    </Suspense>
  )
}
