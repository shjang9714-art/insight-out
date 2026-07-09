'use client'

import { useRouter } from 'next/navigation'
import WatchlistSettingsModal from './WatchlistSettingsModal'

/** 기업동향 관심기업 탭 상단 "관심기업 설정" 버튼 — 인탭에서 바로 추가/삭제(225) */
export default function WatchlistTabHeader() {
  const router = useRouter()

  return (
    <div className="mb-4 flex justify-end">
      <WatchlistSettingsModal onChange={() => router.refresh()} />
    </div>
  )
}
