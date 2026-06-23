import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

// ─── 공개 타입 ────────────────────────────────────────────────────────────────

export interface RagDoc {
  content_id: string
  title: string
  summary_ko: string | null
  snippet: string
  published_at: string | null
  source: string | null
}

// ─── 불용어 (한국어 조사·접속사·의문사) ────────────────────────────────────────

const STOPWORDS = new Set([
  '은', '는', '이', '가', '을', '를', '에', '의', '와', '과', '도', '만',
  '에서', '으로', '로', '하다', '이다', '있다', '없다', '되다', '하는',
  '어떻게', '어떤', '무엇', '왜', '언제', '어디서', '어디', '무슨',
  '최근', '관련', '대한', '대해', '같은', '이런', '그런', '어느',
  '그리고', '하지만', '또한', '그러나', '따라서', '때문', '위해',
  '및', '등', '또는', '혹은', '즉', '특히', '주로', '현재', '향후',
  '동향', '현황', '상황', '어떻습니까', '알려주세요', '설명해주세요',
])

// ─── 질문 토큰화 ──────────────────────────────────────────────────────────────

export function tokenizeQuestion(question: string): string[] {
  const seen = new Set<string>()
  const tokens: string[] = []

  for (const raw of question.split(/\s+/)) {
    const t = raw.replace(/[?？！!.,·~\-]/g, '').trim()
    if (t.length < 2) continue
    if (STOPWORDS.has(t)) continue
    if (seen.has(t)) continue
    seen.add(t)
    tokens.push(t)
  }

  return tokens.slice(0, 6)
}

// ─── 메인 함수 ────────────────────────────────────────────────────────────────

export async function retrieveForQuestion(
  admin: SupabaseClient,
  question: string,
  opts?: { limit?: number },
): Promise<RagDoc[]> {
  const limit = opts?.limit ?? 10
  const tokens = tokenizeQuestion(question)
  if (tokens.length === 0) return []

  // ILIKE OR 필터 구성 (title·summary_ko·body_original)
  const orParts: string[] = []
  for (const token of tokens) {
    const escaped = token.replace(/[%_]/g, '\\$&')
    const pat = `%${escaped}%`
    orParts.push(`title.ilike.${pat}`, `summary_ko.ilike.${pat}`, `body_original.ilike.${pat}`)
  }
  const orFilter = orParts.join(',')

  type ContentRow = {
    id: string
    title: string
    summary_ko: string | null
    body_original: string | null
    published_at: string | null
    sources: { name: string } | null
  }

  const { data, error } = await admin
    .from('contents')
    .select('id, title, summary_ko, body_original, published_at, sources(name)')
    .or(orFilter)
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (error || !data) return []

  const rows = data as unknown as ContentRow[]
  const idSet = new Set(rows.map(r => r.id))

  // 엔티티 alias 보강: 토큰이 alias와 일치하면 해당 엔티티의 최근 콘텐츠 추가
  try {
    const { data: aliasRows } = await admin
      .from('entity_aliases')
      .select('entity_id, alias')
      .in('alias', tokens)

    const entityIds = [...new Set((aliasRows ?? []).map((r: { entity_id: string }) => r.entity_id))]

    if (entityIds.length > 0) {
      const { data: ceRows } = await admin
        .from('content_entities')
        .select('content_id')
        .in('entity_id', entityIds)
        .limit(50)

      const extraIds = [...new Set(
        ((ceRows ?? []) as { content_id: string }[])
          .map(r => r.content_id)
          .filter(id => !idSet.has(id))
      )].slice(0, 5)

      if (extraIds.length > 0) {
        const { data: extraRows } = await admin
          .from('contents')
          .select('id, title, summary_ko, body_original, published_at, sources(name)')
          .in('id', extraIds)
          .eq('status', 'published')
          .order('published_at', { ascending: false, nullsFirst: false })

        if (extraRows) {
          for (const r of extraRows as unknown as ContentRow[]) {
            if (!idSet.has(r.id)) {
              rows.push(r)
              idSet.add(r.id)
            }
          }
        }
      }
    }
  } catch {
    // 엔티티 보강 실패 시 기본 결과만 사용
  }

  // RagDoc 변환 (snippet: body_original 300자 또는 summary_ko)
  return rows.map(r => {
    const snippet = r.body_original
      ? r.body_original.replace(/\s+/g, ' ').trim().slice(0, 300)
      : (r.summary_ko ?? '')
    return {
      content_id: r.id,
      title: r.title,
      summary_ko: r.summary_ko,
      snippet,
      published_at: r.published_at,
      source: (r.sources as { name: string } | null)?.name ?? null,
    }
  })
}
