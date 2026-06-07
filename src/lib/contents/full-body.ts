// 서버 전용 — service_role 사용, 클라이언트 import 금지
import { extract } from '@extractus/article-extractor'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Content } from '@/lib/types'
import { cleanBodyText, htmlToPlainText } from '@/lib/contents/clean-body'

/**
 * 풀본문을 보장해서 반환한다.
 * - body_fetched_at 이 있으면 → body_original 그대로 반환(재추출 없음)
 * - original_url 이 없으면 → body_original 그대로 반환
 * - 그 외 → 원문 fetch+추출(타임아웃 6초) → admin 저장 → 반환
 *   실패/타임아웃이어도 기존 body_original 반환(페이지 절대 깨지지 않음)
 */
export async function ensureFullBody(content: Content): Promise<string> {
  if (content.body_fetched_at) {
    return cleanBodyText(htmlToPlainText(content.body_original ?? ''))
  }

  if (!content.original_url) {
    return cleanBodyText(htmlToPlainText(content.body_original ?? ''))
  }

  const existingBody = cleanBodyText(htmlToPlainText(content.body_original ?? ''))

  try {
    let extracted: string | null = null

    try {
      const result = await extract(
        content.original_url,
        {},
        { signal: AbortSignal.timeout(6000) }
      )
      if (result?.content) {
        extracted = cleanBodyText(htmlToPlainText(result.content))
      }
    } catch {
      // 타임아웃 또는 추출 실패 — 아래에서 body_fetched_at=now 처리
    }

    const admin = createAdminClient()

    if (extracted && extracted.length > existingBody.length && extracted.length > 200) {
      await admin
        .from('contents')
        .update({
          body_original: extracted,
          body_fetched_at: new Date().toISOString(),
        })
        .eq('id', content.id)
      return extracted
    } else {
      await admin
        .from('contents')
        .update({ body_fetched_at: new Date().toISOString() })
        .eq('id', content.id)
      return existingBody
    }
  } catch {
    // DB 오류 포함 — 기존 본문 폴백
    return existingBody
  }
}
