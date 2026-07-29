import { redirect } from 'next/navigation'

export default function PromptsAdminPage() {
  redirect('/admin/reports?tab=prompts')
}
