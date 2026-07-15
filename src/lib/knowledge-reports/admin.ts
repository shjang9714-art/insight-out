import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

export interface KnowledgeReportAdminItem {
  id: string
  title: string
  summary_ko: string | null
  file_path: string | null
  matched_keywords: string[]
  status: string
  created_at: string
  updated_at: string
}

export function isKnowledgeReportSchemaMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === '22P02'
    || error.code === '42P01'
    || error.code === 'PGRST205'
    || error.message?.includes('지식보고서') === true
}

export function normalizeKnowledgeKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(
    value
      .filter((keyword): keyword is string => typeof keyword === 'string')
      .map((keyword) => keyword.replace(/^#+/, '').replace(/[%_]/g, '').trim().slice(0, 50))
      .filter(Boolean),
  )].slice(0, 12)
}

export async function syncKnowledgeReportKeywords(
  admin: SupabaseClient,
  contentId: string,
  keywords: string[],
): Promise<void> {
  const keywordIds: string[] = []

  for (const name of keywords) {
    const { data: existing } = await admin
      .from('keywords')
      .select('id')
      .ilike('name', name)
      .maybeSingle()

    if (existing?.id) {
      keywordIds.push(existing.id)
      continue
    }

    const { data: created, error: createError } = await admin
      .from('keywords')
      .insert({ name })
      .select('id')
      .single()

    if (created?.id) {
      keywordIds.push(created.id)
      continue
    }

    if (createError?.code === '23505') {
      const { data: raced } = await admin
        .from('keywords')
        .select('id')
        .ilike('name', name)
        .maybeSingle()
      if (raced?.id) keywordIds.push(raced.id)
    }
  }

  const { error: deleteError } = await admin
    .from('content_keywords')
    .delete()
    .eq('content_id', contentId)
  if (deleteError) throw deleteError

  if (keywordIds.length === 0) return

  const { error: insertError } = await admin
    .from('content_keywords')
    .insert(keywordIds.map((keywordId) => ({ content_id: contentId, keyword_id: keywordId })))
  if (insertError) throw insertError
}
