import type { Department } from '@/lib/types'

/**
 * 조직 구조(347) — 이 서비스의 사용자는 전원 Ent 부문 소속이다.
 *
 * 부문은 더 이상 선택 대상이 아니라 고정값이다. DB `department` enum(6종)은 그대로 두고
 * (기존 사용자 데이터·admin 화면 호환), 신규 입력은 전부 `FIXED_DEPARTMENT` 로 저장한다.
 * enum 자체를 바꾸려면 마이그레이션이 필요한데, 얻는 게 없다.
 *
 * `users.team`(text)은 자유 입력에서 **그룹 드롭다운**으로 좁힌다. text 컬럼이라 SQL 변경 없음.
 */
export const FIXED_DEPARTMENT: Department = 'Enterprise사업부문'

/** 화면 표기 — DB 저장값('Enterprise사업부문')과 다르다 */
export const DEPARTMENT_DISPLAY_LABEL = 'Ent 부문'

export const ORG_GROUPS = [
  '부문직속',
  '사업혁신그룹',
  '고객그룹',
  'AI사업그룹',
] as const

export type OrgGroup = typeof ORG_GROUPS[number]

export function isOrgGroup(value: string): value is OrgGroup {
  return (ORG_GROUPS as readonly string[]).includes(value)
}
