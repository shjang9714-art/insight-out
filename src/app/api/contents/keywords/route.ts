import { NextRequest, NextResponse } from 'next/server'
import { toDbCategories } from '@/lib/categories'
import { createClient } from '@/lib/supabase/server'
import type { ContentCategory } from '@/lib/types'

interface ContentKeywordRow {
  matched_keywords: string[] | null
}

const QUERY_PAGE_SIZE = 1000

function boundedNumber(value: string | null, fallback: number, min: number, max: number) {
  if (value === null || value.trim() === '') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), min), max) : fallback
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')
  const limit = boundedNumber(searchParams.get('limit'), 12, 1, 50)
  const days = boundedNumber(searchParams.get('days'), 30, 1, 90)
  const dbCategories = category ? toDbCategories(category as ContentCategory) : []

  if (category && dbCategories.length === 0) {
    return NextResponse.json({ error: '올바른 콘텐츠 유형이 필요합니다.' }, { status: 400 })
  }

  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const counts = new Map<string, number>()
  let offset = 0

  while (true) {
    let query = supabase
      .from('contents')
      .select('matched_keywords')
      .eq('status', 'published')
      .gte('collected_at', since)
      .order('id', { ascending: true })
      .range(offset, offset + QUERY_PAGE_SIZE - 1)

    if (dbCategories.length > 0) query = query.in('category', dbCategories)

    const { data, error } = await query
    if (error) {
      console.error('[contents/keywords] 조회 오류:', error)
      return NextResponse.json({ error: '인기 키워드 조회에 실패했습니다.' }, { status: 500 })
    }

    const rows = (data ?? []) as ContentKeywordRow[]
    for (const row of rows) {
      for (const rawKeyword of row.matched_keywords ?? []) {
        const keyword = rawKeyword.trim()
        if (keyword) counts.set(keyword, (counts.get(keyword) ?? 0) + 1)
      }
    }

    if (rows.length < QUERY_PAGE_SIZE) break
    offset += QUERY_PAGE_SIZE
  }

  const keywords = [...counts.entries()]
    .sort(([nameA, countA], [nameB, countB]) => countB - countA || nameA.localeCompare(nameB, 'ko'))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }))

  return NextResponse.json({ keywords })
}
