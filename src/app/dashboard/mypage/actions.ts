'use server'

import { createClient } from '@/lib/supabase/server'
import { updateOwnProfile } from '@/lib/users/update-profile'
import type { LensKey } from '@/lib/lens'
import { FIXED_DEPARTMENT, isOrgGroup } from '@/lib/org'

interface SaveProfileInput {
  name: string
  /** 347: 부문은 Ent 부문 단일 고정 — 클라이언트 입력을 신뢰하지 않고 서버에서 FIXED_DEPARTMENT 로 저장한다 */
  department?: unknown
  team: string
  team_name: string
}

interface ActionResult {
  error: string | null
}

const LENS_KEYS: LensKey[] = ['mine', 'watch', 'all']

function getErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : null
}

async function getAuthenticatedUserId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function saveProfile(input: SaveProfileInput): Promise<ActionResult> {
  const name = input.name.trim()
  const team = input.team.trim()
  const team_name = input.team_name.trim()
  if (!name || !isOrgGroup(team) || !team_name) {
    return { error: '프로필 입력값이 올바르지 않습니다.' }
  }

  const userId = await getAuthenticatedUserId()
  if (!userId) return { error: '로그인 정보를 찾을 수 없습니다.' }

  try {
    await updateOwnProfile(userId, { name, department: FIXED_DEPARTMENT, team, team_name })
    return { error: null }
  } catch (error) {
    console.error('[mypage] 프로필 저장 실패:', error)
    return { error: '프로필 저장에 실패했습니다. 잠시 후 다시 시도해주세요.' }
  }
}

export async function saveDefaultLens(defaultLens: LensKey): Promise<ActionResult> {
  if (!LENS_KEYS.includes(defaultLens)) return { error: '기본 보기 값이 올바르지 않습니다.' }

  const userId = await getAuthenticatedUserId()
  if (!userId) return { error: '로그인 정보를 찾을 수 없습니다.' }

  try {
    await updateOwnProfile(userId, { default_lens: defaultLens })
    return { error: null }
  } catch (error) {
    if (getErrorCode(error) === '42703') return { error: null }
    console.error('[mypage] 기본 보기 저장 실패:', error)
    return { error: '기본 보기 저장에 실패했습니다. 잠시 후 다시 시도해주세요.' }
  }
}
