import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import UserManager from '@/components/admin/UserManager'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'

export const metadata: Metadata = {
  title: '사용자 관리 | 어드민 | Insight Out',
  description: '전체 사용자 목록 및 권한(role)을 관리합니다.',
}

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ page?: string; sort?: string; dir?: string }>
}

const PAGE_SIZE = 20
const SORT_KEYS = new Set(['email', 'name', 'role', 'approval_status', 'created_at'])

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const params = await searchParams
  const parsedPage = Number.parseInt(params.page ?? '1', 10)
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1
  const sortKey = params.sort && SORT_KEYS.has(params.sort) ? params.sort : 'created_at'
  const sortDir = params.dir === 'asc' ? 'asc' : 'desc'
  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: users, error, count } = await svc
    .from('users')
    .select('id, email, name, department, team, team_name, position, role, approval_status, created_at', { count: 'exact' })
    .order(sortKey, { ascending: sortDir === 'asc' })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

  return (
    <>
      <AdminPageHeader />
      <UserManager
        key={`${page}-${sortKey}-${sortDir}`}
        initialUsers={users ?? []}
        tableState={error ? 'error' : (users ?? []).length === 0 ? 'empty' : 'idle'}
        page={page}
        pageSize={PAGE_SIZE}
        total={count}
        sort={{ key: sortKey, dir: sortDir }}
      />
    </>
  )
}
