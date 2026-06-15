import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { ensureFullBody } from '@/lib/contents/full-body'
import { cleanBodyText, htmlToPlainText } from '@/lib/contents/clean-body'
import type { Content } from '@/lib/types'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(toSet) {
          toSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data } = await supabase
    .from('contents')
    .select('id, title, body_original, body_translated_ko, body_fetched_at, original_url, original_language, source_id, thumbnail_url, title_hash, body_hash, view_count, bookmark_count, is_editor_pick, cluster_id, status, collected_at, created_at, updated_at, summary_ko, file_path, published_at')
    .eq('id', id)
    .eq('status', 'published')
    .single()

  if (!data) {
    return Response.json({ status: 'failed', body: '' }, { status: 404 })
  }

  const fallback = cleanBodyText(htmlToPlainText(data.body_original ?? ''))

  try {
    const body = await ensureFullBody(data as Content)
    return Response.json({ status: 'done', body: body || fallback })
  } catch {
    return Response.json({ status: 'failed', body: fallback })
  }
}
