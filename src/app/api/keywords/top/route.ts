import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface ContentKeywordRow {
  keyword_id: string
  keywords: { id: string; name: string; service_id: string | null } | null
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const serviceId = searchParams.get('service_id')
  const limit = Math.min(Number(searchParams.get('limit') ?? 30) || 30, 50)

  if (!serviceId) {
    return NextResponse.json({ error: 'service_id 가 필요합니다.' }, { status: 400 })
  }

  // 해당 서비스에 속한 키워드가 콘텐츠에 태깅된 빈도 기준 상위 N개.
  const { data, error } = await supabase
    .from('content_keywords')
    .select('keyword_id, keywords!inner(id, name, service_id)')
    .eq('keywords.service_id', serviceId)
    .limit(2000)

  if (error) {
    console.error('[keywords/top] 조회 오류:', error)
    return NextResponse.json({ error: '키워드 조회에 실패했습니다.' }, { status: 500 })
  }

  const counts = new Map<string, { id: string; name: string; count: number }>()
  for (const row of (data ?? []) as unknown as ContentKeywordRow[]) {
    const kw = row.keywords
    if (!kw) continue
    const existing = counts.get(kw.id)
    if (existing) {
      existing.count += 1
    } else {
      counts.set(kw.id, { id: kw.id, name: kw.name, count: 1 })
    }
  }

  const top = [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map(({ id, name }) => ({ id, name }))

  return NextResponse.json({ keywords: top })
}
