import { redirect } from 'next/navigation'

// 524 — 사전·분류(/admin/keywords)의 "키워드 그룹·시그널 기준" 탭으로 통합.
export default function KeywordGroupsPage() {
  redirect('/admin/keywords?tab=keyword-groups')
}
