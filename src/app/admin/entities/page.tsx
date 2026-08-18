import { redirect } from 'next/navigation'

// 524 — 사전·분류(/admin/keywords)의 "엔티티 사전" 탭으로 통합. 521(계층·병합) 기능은 EntityManager 그대로 재사용.
export default function EntitiesPage() {
  redirect('/admin/keywords?tab=entities')
}
