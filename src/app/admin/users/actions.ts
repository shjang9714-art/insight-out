'use server'

import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { UserRole, ApprovalStatus } from '@/lib/types'
import { revalidatePath } from 'next/cache'
import { FIXED_DEPARTMENT, isOrgGroup } from '@/lib/org'

async function requireAdmin() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cs) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  return profile?.role === 'admin' ? user : null
}

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function updateUserProfileByAdmin(
  userId: string,
  patch: { name: string; team: string; team_name: string },
) {
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: '권한이 없습니다.' }

  const name = patch.name.trim()
  const teamName = patch.team_name.trim()

  if (!name) return { ok: false, error: '이름은 비울 수 없습니다.' }
  if (!isOrgGroup(patch.team)) {
    return { ok: false, error: '그룹 값이 올바르지 않습니다.' }
  }

  const { error } = await serviceClient()
    .from('users')
    .update({
      name,
      team: patch.team,
      team_name: teamName,
      department: FIXED_DEPARTMENT,
    })
    .eq('id', userId)

  if (error) return { ok: false, error: `사용자 정보 저장 실패: ${error.message}` }

  revalidatePath('/admin/users')
  return { ok: true, error: null }
}

export async function updateUserRole(userId: string, newRole: UserRole) {
  const admin = await requireAdmin()
  if (!admin) return { error: '권한이 없습니다.' }

  const { error } = await serviceClient()
    .from('users')
    .update({ role: newRole })
    .eq('id', userId)

  if (error) return { error: `권한 변경 실패: ${error.message}` }
  return { error: null }
}

export async function promoteByEmail(email: string) {
  const admin = await requireAdmin()
  if (!admin) return { error: '권한이 없습니다.' }

  const svc = serviceClient()

  const { data: target, error: findErr } = await svc
    .from('users')
    .select('id, email, name, department, team, team_name, position, role, approval_status, created_at')
    .eq('email', email.trim().toLowerCase())
    .single()

  if (findErr || !target) return { error: '해당 이메일의 사용자를 찾을 수 없습니다.', user: null }
  if (target.role === 'admin') return { error: '이미 admin 권한을 가진 사용자입니다.', user: null }

  const { error: updateErr } = await svc
    .from('users')
    .update({ role: 'admin' })
    .eq('id', target.id)

  if (updateErr) return { error: `권한 변경 실패: ${updateErr.message}`, user: null }

  return { error: null, user: { ...target, role: 'admin' as UserRole } }
}

export async function approveUser(userId: string) {
  const admin = await requireAdmin()
  if (!admin) return { error: '권한이 없습니다.' }

  const { error } = await serviceClient()
    .from('users')
    .update({
      approval_status: 'approved' as ApprovalStatus,
      approved_at: new Date().toISOString(),
      approved_by: admin.id,
    })
    .eq('id', userId)

  if (error) return { error: `승인 처리 실패: ${error.message}` }
  revalidatePath('/admin/users')
  return { error: null }
}

export async function rejectUser(userId: string) {
  const admin = await requireAdmin()
  if (!admin) return { error: '권한이 없습니다.' }

  const { error } = await serviceClient()
    .from('users')
    .update({
      approval_status: 'rejected' as ApprovalStatus,
      approved_at: new Date().toISOString(),
      approved_by: admin.id,
    })
    .eq('id', userId)

  if (error) return { error: `거절 처리 실패: ${error.message}` }
  revalidatePath('/admin/users')
  return { error: null }
}
