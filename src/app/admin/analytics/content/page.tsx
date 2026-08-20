import { redirect } from 'next/navigation'

// 해체된 통계분석의 옛 딥링크는 독립 발행 분석 화면으로 보낸다.
export default function AnalyticsContentPage() {
  redirect('/admin/analytics/publish')
}
