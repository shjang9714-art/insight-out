export const ADMIN_CAPABILITIES = [
  'manage_admins',
  'reset_data',
  'delete_content',
  'manage_settings',
  'send_broadcast',
  'manage_sources',
] as const

export type AdminCapability = (typeof ADMIN_CAPABILITIES)[number]

/**
 * 지시서 485 — 능력 판정의 유일한 지점.
 * 현 단계에서는 admin 이면 모든 능력을 가진다. 저장 방식(플래그/역할 테이블)은
 * 지시서 492 에서 **이 함수 안만** 바꾼다. 호출부 83곳은 그때 손대지 않는다.
 * ⚠️ 여기서 role 종류를 늘리지 마라. 능력 축과 역할 축을 섞으면 492 가 불가능해진다.
 */
export function hasCapability(role: string | null | undefined, _cap?: AdminCapability): boolean {
  void _cap
  return role === 'admin'
}
