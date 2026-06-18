import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import UserManager from '@/components/admin/UserManager'

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
    .select('id, email, name, department, team, position, role, approval_status, created_at')
    .order('created_at', { ascending: false })

  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">사용자 관리</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          전체 사용자 목록과 권한(admin / user)을 관리합니다.
        </p>
      </div>
      <UserManager initialUsers={users ?? []} />
    </>
  )
}
