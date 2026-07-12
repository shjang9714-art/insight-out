// 서버 전용 — service_role 사용, 클라이언트 import 금지
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Supabase Storage 비공개 버킷 "reports"에서 서명 URL(2시간)을 생성해 반환한다.
 * 실패·에러 시 null 반환(페이지가 깨지지 않도록 폴백).
 * pdf.js가 range 요청으로 조각조각 가져오므로 만료가 짧으면 뒷장 로드가 조용히 실패한다(307).
 * downloadName 지정 시 Content-Disposition으로 그 파일명이 내려간다(다운로드 버튼용).
 */
export async function getReportSignedUrl(
  filePath: string,
  downloadName?: string,
): Promise<string | null> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.storage
      .from('reports')
      .createSignedUrl(filePath, 60 * 60 * 2, downloadName ? { download: downloadName } : undefined) // 2시간
    return error ? null : (data?.signedUrl ?? null)
  } catch {
    return null
  }
}
