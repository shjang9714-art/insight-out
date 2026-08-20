import { redirect } from 'next/navigation'

export default function AiJobsAdminPage() {
  redirect('/admin/sources?tab=ai-jobs')
}
