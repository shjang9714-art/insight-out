'use client'

import AdminTabShell from '@/components/admin/ui/AdminTabShell'
import BriefingManager from '@/components/admin/BriefingManager'

/**
 * 400 §3.1 — 모닝브리핑은 탭화 대상이 아니다(실제 구획이 목록 하나뿐). tabs=[]로 Shell의
 * 브레드크럼·헤더 표준만 취하고 탭 바는 렌더하지 않는다(AdminTabShell의 tabs.length>0 가드로 확인됨).
 * TTS 사용량 카드는 BriefingManager 내부 조회에 묶여 있어 뽑아내면 조회 로직까지 옮겨야 한다 —
 * 이번엔 옮기지 않고(내부 로직 무수정 원칙) BriefingManager 안에 그대로 둔다.
 */
export default function BriefingHub() {
  return (
    <AdminTabShell
      tabs={[]}
      defaultTab=""
      aria-label="모닝브리핑 관리"
      renderContent={() => <BriefingManager />}
    />
  )
}
