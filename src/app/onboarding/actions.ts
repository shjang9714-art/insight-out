'use server'

import { createClient } from '@/lib/supabase/server'
import { updateOwnProfile } from '@/lib/users/update-profile'
import type { LensKey } from '@/lib/lens'
import { FIXED_DEPARTMENT, isOrgGroup } from '@/lib/org'

interface CompleteOnboardingInput {
  name: string
  team: string
  default_lens: LensKey
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

export async function completeOnboarding(input: CompleteOnboardingInput): Promise<ActionResult> {
  const name = input.name.trim()
  const team = input.team.trim()
  if (!name || !isOrgGroup(team) || !LENS_KEYS.includes(input.default_lens)) {
    return { error: '온보딩 입력값이 올바르지 않습니다.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '로그인 정보를 찾을 수 없습니다.' }

  const basePatch = {
    name,
    department: FIXED_DEPARTMENT,
    team,
    onboarding_completed: true,
  }

  try {
    await updateOwnProfile(user.id, { ...basePatch, default_lens: input.default_lens })
    return { error: null }
  } catch (error) {
    // SQL 309 미적용 환경에서도 온보딩 완료가 막히지 않도록 기존 폴백을 유지한다.
    if (getErrorCode(error) === '42703') {
      try {
        await updateOwnProfile(user.id, basePatch)
        return { error: null }
      } catch (fallbackError) {
        console.error('[onboarding] 프로필 폴백 저장 실패:', fallbackError)
      }
    } else {
      console.error('[onboarding] 프로필 저장 실패:', error)
    }
    return { error: '프로필 저장에 실패했습니다. 잠시 후 다시 시도해주세요.' }
  }
}
