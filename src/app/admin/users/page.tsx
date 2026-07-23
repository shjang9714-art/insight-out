import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import UserManager from '@/components/admin/UserManager'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'

export const metadata: Metadata = {
  title: '사용자 관리 | 어드민 | Insight Out',
  description: '전체 사용자 목록 및 권한(role)을 관리합니다.',
}

export const dynamic = 'force-dynamic'

export default async function AdminUsersPage() {
  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: users } = await svc
    .from('users')
    .select('id, email, name, department, team, team_name, position, role, approval_status, created_at')
    .order('created_at', { ascending: false })

  return (
    <>
      <AdminPageHeader />
      <UserManager initialUsers={users ?? []} />
    </>
  )
}
