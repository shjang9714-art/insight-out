// ⚠️ 서버 전용 파일 — 클라이언트 컴포넌트에서 import 절대 금지
// SUPABASE_SERVICE_ROLE_KEY 는 모든 RLS 를 우회하는 마스터 키입니다.
// 반드시 Route Handler · Server Action · 서버 전용 모듈에서만 호출하세요.

import { createClient } from '@supabase/supabase-js'

/**
 * Supabase service_role 클라이언트 생성 (호출 시마다 새 인스턴스 반환).
 * 전역 변수로 보관하지 말 것 — 요청 범위 안에서만 사용.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.'
    )
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
