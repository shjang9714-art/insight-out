import { redirect } from 'next/navigation'

export default function AdminTranslationPage() {
  redirect('/admin/settings?tab=api')
}
