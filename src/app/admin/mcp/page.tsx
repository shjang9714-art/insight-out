import { redirect } from 'next/navigation'

export default function AdminMcpPage() {
  redirect('/admin/settings?tab=mcp')
}
