import { redirect } from 'next/navigation'

export default function EnrichPage() {
  redirect('/admin/sources?tab=enrich')
}
