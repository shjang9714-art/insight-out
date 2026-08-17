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

// GoTrue(Supabase Auth 서버)에는 user_id 기준 세션 강제 종료 API가 없다.
// admin.auth.admin.signOut()은 대상 세션 자신의 JWT를 필요로 해 관리자가 다른 사용자에게
// 쓸 수 없고, 세션을 실제로 지우는 유일한 경로(models.Logout)는 계정 소프트 삭제에
// 묶여 있어 계정 자체가 파괴된다. 대신 ban_duration을 걸면 GoTrue가 매 인증 요청마다
// (이미 발급된 access token이 만료 전이어도) banned_until을 검사해 즉시 거부한다 —
// 계정을 지우지 않고 즉시 로그아웃과 동일한 효과를 낸다. 24시간 후 자동 해제.
const FORCE_SIGNOUT_BAN_DURATION = '24h'

export async function forceSignOutUser(userId: string) {
  const gate = await requireAdminAction({ action: 'user.force_signout', capability: 'manage_admins' })
  if (!gate.ok) return { error: gate.error }

  const svc = serviceClient()

  if (userId === gate.userId) {
    const error = '본인 세션은 강제 종료할 수 없습니다. 다른 관리자에게 요청하세요.'
    await completeAudit(svc, gate.auditId, { targetType: 'users', targetId: userId, outcome: 'failed', error })
    return { error }
  }

  const { error } = await svc.auth.admin.updateUserById(userId, { ban_duration: FORCE_SIGNOUT_BAN_DURATION })

  await completeAudit(svc, gate.auditId, { targetType: 'users', targetId: userId, payload: { banDuration: FORCE_SIGNOUT_BAN_DURATION }, outcome: error ? 'failed' : 'ok', error: error?.message })
  if (error) return { error: `세션 종료 실패: ${error.message}` }
  return { error: null }
}

export async function liftSignOutBan(userId: string) {
  const gate = await requireAdminAction({ action: 'user.ban_lift', capability: 'manage_admins' })
  if (!gate.ok) return { error: gate.error }

  const svc = serviceClient()

  const { error } = await svc.auth.admin.updateUserById(userId, { ban_duration: 'none' })

  await completeAudit(svc, gate.auditId, { targetType: 'users', targetId: userId, outcome: error ? 'failed' : 'ok', error: error?.message })
  if (error) return { error: `차단 해제 실패: ${error.message}` }
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
