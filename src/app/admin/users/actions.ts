'use server'

import { createClient as createServiceClient } from '@supabase/supabase-js'
import type { UserRole } from '@/lib/types'
import { revalidatePath } from 'next/cache'
import { FIXED_DEPARTMENT, isOrgGroup } from '@/lib/org'
import { requireAdminAction } from '@/lib/admin/require-admin-action'
import { completeAudit } from '@/lib/admin/audit'
import { deactivateAccountById } from '@/lib/users/deactivate-account'

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

export async function changeUserEmailByAdmin(userId: string, newEmail: string) {
  const gate = await requireAdminAction({ action: 'user.email.update', capability: 'manage_admins' })
  if (!gate.ok) return { error: gate.error }

  const email = newEmail.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: '올바른 이메일 형식을 입력해주세요.' }
  }

  const svc = serviceClient()

  // auth.users 와 public.users 둘 다 반영한다 — Auth 갱신 없이 public.users 만 바꾸면
  // 로그인 이메일과 어긋난다(mypage changeEmail 은 세션 본인이 auth.updateUser 로 갱신하지만,
  // 관리자는 admin.updateUserById 로 대상 계정을 대신 갱신한다).
  const { error: authError } = await svc.auth.admin.updateUserById(userId, { email, email_confirm: true })
  if (authError) {
    await completeAudit(svc, gate.auditId, { targetType: 'users', targetId: userId, payload: { newEmail: email }, outcome: 'failed', error: authError.message })
    return { error: `이메일 변경 실패: ${authError.message}` }
  }

  const { error } = await svc.from('users').update({ email }).eq('id', userId)

  await completeAudit(svc, gate.auditId, { targetType: 'users', targetId: userId, payload: { newEmail: email }, outcome: error ? 'failed' : 'ok', error: error?.message })
  if (error) return { error: `이메일 변경 실패: ${error.message}` }

  revalidatePath('/admin/users')
  return { error: null }
}

export async function deactivateUserByAdmin(userId: string) {
  const gate = await requireAdminAction({ action: 'user.deactivate', capability: 'manage_admins' })
  if (!gate.ok) return { error: gate.error }

  const svc = serviceClient()

  try {
    await deactivateAccountById(userId)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await completeAudit(svc, gate.auditId, { targetType: 'users', targetId: userId, outcome: 'failed', error: message })
    return { error: `계정 비활성화 실패: ${message}` }
  }

  await completeAudit(svc, gate.auditId, { targetType: 'users', targetId: userId, outcome: 'ok' })
  revalidatePath('/admin/users')
  return { error: null }
}

export async function createAdminUser(input: {
  email: string
  password: string
  name: string
  team: string
  team_name: string
  role: UserRole
}) {
  const gate = await requireAdminAction({ action: 'user.create', capability: 'manage_admins' })
  if (!gate.ok) return { error: gate.error, user: null }

  const email = input.email.trim().toLowerCase()
  const name = input.name.trim()
  const teamName = input.team_name.trim()

  if (!email) return { error: '이메일을 입력해주세요.', user: null }
  if (input.password.length < 8) return { error: '비밀번호는 8자 이상이어야 합니다.', user: null }
  if (!name) return { error: '이름을 입력해주세요.', user: null }
  if (!isOrgGroup(input.team)) return { error: '그룹 값이 올바르지 않습니다.', user: null }

  const svc = serviceClient()

  const { data: created, error: createErr } = await svc.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
  })

  if (createErr || !created.user) {
    await completeAudit(svc, gate.auditId, { targetType: 'users', payload: { email }, outcome: 'failed', error: createErr?.message })
    return { error: `계정 생성 실패: ${createErr?.message ?? '알 수 없는 오류'}`, user: null }
  }

  const userId = created.user.id

  const { data: updated, error: updateErr } = await svc
    .from('users')
    .update({
      name,
      team: input.team,
      team_name: teamName,
      department: FIXED_DEPARTMENT,
      role: input.role,
      onboarding_completed: true,
    })
    .eq('id', userId)
    .select('id, email, name, department, team, team_name, position, role, approval_status, created_at')
    .single()

  await completeAudit(svc, gate.auditId, { targetType: 'users', targetId: userId, payload: { email, role: input.role }, outcome: updateErr ? 'failed' : 'ok', error: updateErr?.message })
  if (updateErr || !updated) return { error: `계정 정보 저장 실패: ${updateErr?.message ?? '알 수 없는 오류'}`, user: null }

  revalidatePath('/admin/users')
  return { error: null, user: updated }
}
