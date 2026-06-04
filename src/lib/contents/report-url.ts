// 서버 전용 — service_role 사용, 클라이언트 import 금지
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Supabase Storage 비공개 버킷 "reports"에서 서명 URL(30분)을 생성해 반환한다.
 * 실패·에러 시 null 반환(페이지가 깨지지 않도록 폴백).
 */
export async function getReportSignedUrl(filePath: string): Promise<string | null> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.storage
      .from('reports')
      .createSignedUrl(filePath, 60 * 30) // 30분
    return error ? null : (data?.signedUrl ?? null)
  } catch {
    return null
  }
}
