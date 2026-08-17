import type { Metadata } from 'next'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import UserManager from '@/components/admin/UserManager'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'
import { createClient } from '@/lib/supabase/server'

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
  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [usersResult, adminCountResult] = await Promise.all([
    svc
      .from('users')
      .select('id, email, name, department, team, team_name, position, role, approval_status, created_at', { count: 'exact' })
      .order(sortKey, { ascending: sortDir === 'asc' })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    svc
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin'),
  ])

  const { data: users, error, count } = usersResult

  // public.users에는 banned_until이 없다(auth.users 소관, PostgREST에 노출되지 않는 스키마) —
  // 목록 조회 자체엔 이 정보가 없어 행마다 Admin API로 개별 조회한다(지시서 506 보완).
  // 페이지 크기가 20으로 고정돼 있어 왕복 20회 추가는 어드민 전용 트래픽 범위에서 감내 가능.
  const bannedUntilById = new Map<string, string | null>()
  await Promise.all(
    (users ?? []).map(async (u) => {
      const { data } = await svc.auth.admin.getUserById(u.id)
      bannedUntilById.set(u.id, data.user?.banned_until ?? null)
    })
  )
  const usersWithBanStatus = (users ?? []).map((u) => ({
    ...u,
    bannedUntil: bannedUntilById.get(u.id) ?? null,
  }))

  return (
    <>
      <AdminPageHeader />
      <UserManager
        key={`${page}-${sortKey}-${sortDir}`}
        initialUsers={usersWithBanStatus}
        currentUserId={user?.id ?? ''}
        initialAdminCount={adminCountResult.count ?? 0}
        tableState={error ? 'error' : (users ?? []).length === 0 ? 'empty' : 'idle'}
        page={page}
        pageSize={PAGE_SIZE}
        total={count}
        sort={{ key: sortKey, dir: sortDir }}
      />
    </>
  )
}
