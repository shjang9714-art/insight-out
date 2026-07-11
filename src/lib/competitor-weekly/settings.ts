import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface CompetitorWeeklySettings {
  enabled: boolean
  generate_dow: number
  generate_hour: number
  auto_publish: boolean
}

/** 기존 동작과 동일(구 "0 21 * * 0" UTC = 월요일 06시 KST, 초안 생성) — SQL 284 미적용 시 폴백(284). */
export const DEFAULT_COMPETITOR_WEEKLY_SETTINGS: CompetitorWeeklySettings = {
  enabled: true,
  generate_dow: 1,
  generate_hour: 6,
  auto_publish: false,
}

const UNDEFINED_TABLE = '42P01'

/** 발행 스케줄 설정(단일행) 조회. 테이블 미적용(42P01) 시 ready:false + 기본값(graceful, 284). */
export async function getCompetitorWeeklySettings(
  admin: SupabaseClient,
): Promise<{ settings: CompetitorWeeklySettings; ready: boolean }> {
  const { data, error } = await admin
    .from('competitor_weekly_settings')
    .select('enabled, generate_dow, generate_hour, auto_publish')
    .eq('id', true)
    .maybeSingle()

  if (error) {
    if (error.code !== UNDEFINED_TABLE) {
      console.warn('[CompetitorWeekly] 발행 스케줄 설정 조회 실패:', error.message)
    }
    return { settings: DEFAULT_COMPETITOR_WEEKLY_SETTINGS, ready: false }
  }
  if (!data) {
    return { settings: DEFAULT_COMPETITOR_WEEKLY_SETTINGS, ready: true }
  }
  return { settings: data as CompetitorWeeklySettings, ready: true }
}
