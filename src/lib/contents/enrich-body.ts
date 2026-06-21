import 'server-only'
import { extract } from '@extractus/article-extractor'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cleanBodyText, htmlToPlainText } from '@/lib/contents/clean-body'
import { resolveArticleUrl } from '@/lib/crawler/resolve-url'

const ENRICH_MIN_BODY_LEN = 400

export interface EnrichBodyRow {
  id: string
  original_url: string
  body_original: string | null
}

/**
 * 단일 콘텐츠 행의 풀본문을 추출해 DB에 업데이트한다.
 * - improved: 풀본문 추출 성공 → body_original + body_fetched_at 업데이트
 * - marked:   추출 실패·스니펫이 더 길면 → body_fetched_at만 마킹(재시도 방지)
 * - error:    행 처리 중 예외(개발 경로; 호출부에서 집계만)
 */
export async function enrichOneBody(
  admin: SupabaseClient,
  row: EnrichBodyRow,
): Promise<'improved' | 'marked' | 'error'> {
  try {
    const resolved = await resolveArticleUrl(row.original_url)

    let extracted: string | null = null
    try {
      const result = await extract(resolved, {}, { signal: AbortSignal.timeout(6000) })
      if (result?.content) {
        extracted = cleanBodyText(htmlToPlainText(result.content))
      }
    } catch {
      // 추출 실패·타임아웃 — body_fetched_at 마킹만
    }

    const existingBody = cleanBodyText(htmlToPlainText(row.body_original ?? ''))
    const improved =
      extracted !== null &&
      extracted.length > existingBody.length &&
      extracted.length >= ENRICH_MIN_BODY_LEN

    if (improved && extracted) {
      await admin
        .from('contents')
        .update({ body_original: extracted, body_fetched_at: new Date().toISOString() })
        .eq('id', row.id)
      return 'improved'
    }

    await admin
      .from('contents')
      .update({ body_fetched_at: new Date().toISOString() })
      .eq('id', row.id)
    return 'marked'
  } catch (e) {
    console.error('[본문보강] 아이템 오류 (id:', row.id, '):', e)
    return 'error'
  }
}
