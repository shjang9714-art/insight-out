import { redirect } from 'next/navigation'

export default function LlmAdminPage() {
  redirect('/admin/settings?tab=llm')
}
