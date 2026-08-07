'use server'

import { createClient as createServiceClient } from '@supabase/supabase-js'
import type { UserRole, ApprovalStatus } from '@/lib/types'
import { revalidatePath } from 'next/cache'
import { FIXED_DEPARTMENT, isOrgGroup } from '@/lib/org'
import { requireAdminAction } from '@/lib/admin/require-admin-action'
import { completeAudit } from '@/lib/admin/audit'

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
  const gate = await requireAdminAction({ action: 'user.profile.update' })
  if (!gate.ok) return { ok: false, error: gate.error }

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

  await completeAudit(serviceClient(), gate.auditId, { targetType: 'users', targetId: userId, outcome: error ? 'failed' : 'ok', error: error?.message })
  if (error) return { ok: false, error: `사용자 정보 저장 실패: ${error.message}` }

  revalidatePath('/admin/users')
  return { ok: true, error: null }
}

export async function updateUserRole(userId: string, newRole: UserRole) {
  const gate = await requireAdminAction({ action: 'user.role.update', capability: 'manage_admins' })
  if (!gate.ok) return { error: gate.error }

  const svc = serviceClient()

  if (userId === gate.userId && newRole !== 'super_admin') {
    const error = '본인의 관리자 권한은 스스로 해제할 수 없습니다. 다른 관리자에게 요청하세요.'
    await completeAudit(svc, gate.auditId, {
      targetType: 'users',
      targetId: userId,
      payload: { nextRole: newRole },
      outcome: 'failed',
      error,
    })
    return { error }
  }

  const { data: previous } = await svc.from('users').select('role').eq('id', userId).single()

  if (previous?.role === 'super_admin' && newRole !== 'super_admin') {
    // 관리자 수 확인과 권한 변경은 원자적이지 않다. 동시 강등의 완전한 차단은 492의 DB 트리거에서 처리한다.
    const { count: adminCount } = await svc
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'super_admin')

    if (adminCount === 1) {
      const error = '마지막 super_admin입니다. 다른 super_admin을 먼저 지정한 뒤 변경하세요.'
      await completeAudit(svc, gate.auditId, {
        targetType: 'users',
        targetId: userId,
        payload: { previousRole: previous.role, nextRole: newRole },
        outcome: 'failed',
        error,
      })
      return { error }
    }
  }

  const { error } = await svc
    .from('users')
    .update({ role: newRole })
    .eq('id', userId)

  await completeAudit(svc, gate.auditId, { targetType: 'users', targetId: userId, payload: { previousRole: previous?.role ?? null, nextRole: newRole }, outcome: error ? 'failed' : 'ok', error: error?.message })
  if (error) return { error: `권한 변경 실패: ${error.message}` }
  revalidatePath('/admin/users')
  return { error: null }
}

export async function promoteByEmail(email: string) {
  const gate = await requireAdminAction({ action: 'user.role.update', capability: 'manage_admins' })
  if (!gate.ok) return { error: gate.error }

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

  await completeAudit(svc, gate.auditId, { targetType: 'users', targetId: target.id, payload: { previousRole: target.role, nextRole: 'admin' }, outcome: updateErr ? 'failed' : 'ok', error: updateErr?.message })
  if (updateErr) return { error: `권한 변경 실패: ${updateErr.message}`, user: null }

  return { error: null, user: { ...target, role: 'admin' as UserRole } }
}

export async function approveUser(userId: string) {
  const gate = await requireAdminAction({ action: 'user.approval.update' })
  if (!gate.ok) return { error: gate.error }

  const { error } = await serviceClient()
    .from('users')
    .update({
      approval_status: 'approved' as ApprovalStatus,
      approved_at: new Date().toISOString(),
      approved_by: gate.userId,
    })
    .eq('id', userId)

  await completeAudit(serviceClient(), gate.auditId, { targetType: 'users', targetId: userId, payload: { nextStatus: 'approved' }, outcome: error ? 'failed' : 'ok', error: error?.message })
  if (error) return { error: `승인 처리 실패: ${error.message}` }
  revalidatePath('/admin/users')
  return { error: null }
}

export async function rejectUser(userId: string) {
  const gate = await requireAdminAction({ action: 'user.approval.update' })
  if (!gate.ok) return { error: gate.error }

  const { error } = await serviceClient()
    .from('users')
    .update({
      approval_status: 'rejected' as ApprovalStatus,
      approved_at: new Date().toISOString(),
      approved_by: gate.userId,
    })
    .eq('id', userId)

  await completeAudit(serviceClient(), gate.auditId, { targetType: 'users', targetId: userId, payload: { nextStatus: 'rejected' }, outcome: error ? 'failed' : 'ok', error: error?.message })
  if (error) return { error: `거절 처리 실패: ${error.message}` }
  revalidatePath('/admin/users')
  return { error: null }
}
