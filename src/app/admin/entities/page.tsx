import { redirect } from 'next/navigation'

// 키워드(/admin/keywords)의 "관계지도 사전" 탭으로 통합. 521(계층·병합) 기능은 EntityManager 그대로 재사용.
export default function EntitiesPage() {
  redirect('/admin/keywords?tab=entities')
}
