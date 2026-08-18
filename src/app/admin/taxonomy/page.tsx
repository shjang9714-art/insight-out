import { redirect } from 'next/navigation'

// 524 — 사전·분류(/admin/keywords)의 "분류·카테고리" 탭으로 통합.
export default function TaxonomyPage() {
  redirect('/admin/keywords?tab=taxonomy')
}
