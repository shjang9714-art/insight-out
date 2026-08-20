import { redirect } from 'next/navigation'

// 시스템 설정의 "AI 모델" 탭으로 통합.
export default function AiCostAnalyticsPage() {
  redirect('/admin/settings?tab=llm')
}
