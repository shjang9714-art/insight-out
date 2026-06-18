import { redirect } from 'next/navigation'

export default function EntitiesPage() {
  redirect('/dashboard/ai-analysis?tab=entities')
}
