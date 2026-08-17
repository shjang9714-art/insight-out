export const ADMIN_CAPABILITIES = [
  'manage_admins',
  'reset_data',
  'delete_content',
  'manage_settings',
  'send_broadcast',
  'manage_sources',
] as const

export type AdminCapability = (typeof ADMIN_CAPABILITIES)[number]
export const ADMIN_ROLES = ['admin', 'super_admin'] as const

export const ROLE_CAPABILITIES: Record<string, readonly AdminCapability[]> = {
  super_admin: ADMIN_CAPABILITIES,
  admin: ['delete_content', 'manage_sources', 'send_broadcast'],
}

/**
 * 지시서 485 — 능력 판정의 유일한 지점.
 * 현 단계에서는 admin 이면 모든 능력을 가진다. 저장 방식(플래그/역할 테이블)은
 * 지시서 492 에서 **이 함수 안만** 바꾼다. 호출부 83곳은 그때 손대지 않는다.
 * 역할별 능력은 이 맵에서만 판정한다.
 */
export function hasCapability(role: string | null | undefined, cap?: AdminCapability): boolean {
  if (role === 'super_admin') return true
  if (role !== 'admin') return false
  if (!cap) return true
  return ROLE_CAPABILITIES[role]?.includes(cap) ?? false
}
