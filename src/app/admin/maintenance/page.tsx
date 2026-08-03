import { redirect } from 'next/navigation'

export default function AdminMaintenancePage() {
  redirect('/admin/settings?tab=maintenance')
}
