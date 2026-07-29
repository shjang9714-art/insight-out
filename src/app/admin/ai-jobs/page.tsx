import { redirect } from 'next/navigation'

export default function AiJobsAdminPage() {
  redirect('/admin/reports?tab=ai-jobs')
}
