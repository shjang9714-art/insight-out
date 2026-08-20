import { redirect } from 'next/navigation'

export default function ExclusionRulesPage() {
  redirect('/admin/sources?tab=exclusion-rules')
}
