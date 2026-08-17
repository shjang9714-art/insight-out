import { NextRequest, NextResponse } from 'next/server'
import { toDbCategories } from '@/lib/categories'
import { createClient } from '@/lib/supabase/server'
import type { ContentCategory } from '@/lib/types'

interface ContentKeywordRow {
  matched_keywords: string[] | null
  matched_groups: string[] | null
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
  // 기존 top-N 칩용 집계(matched_keywords만, 그대로 유지 — 응답 형태 불변).
  const counts = new Map<string, number>()
  // 514 — 카드 태그 희소도 정렬용 전체 문서빈도 맵. matched_groups+matched_keywords
  // 합집합을 문서당 1회만 세고(같은 문서 안에서 중복 등장해도 doc frequency는 1),
  // 대소문자 무시로 합산한다. 키는 소문자로 통일 — 호출부(tagsOf2)가 각 콘텐츠 행에서
  // 만난 표기(예: 'KT')로 조회하는데, 그 표기가 이 맵의 "첫 등장" 표기(예: 'kt')와
  // 다를 수 있어 원문 표기를 키로 쓰면 조회가 누락된다.
  const freqCounts = new Map<string, number>()
  let offset = 0

  while (true) {
    let query = supabase
      .from('contents')
      .select('matched_keywords, matched_groups')
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

      const docTags = new Set<string>()
      for (const raw of [...(row.matched_groups ?? []), ...(row.matched_keywords ?? [])]) {
        const tag = raw.trim()
        if (!tag) continue
        docTags.add(tag.toLowerCase())
      }
      for (const lower of docTags) {
        freqCounts.set(lower, (freqCounts.get(lower) ?? 0) + 1)
      }
    }

    if (rows.length < QUERY_PAGE_SIZE) break
    offset += QUERY_PAGE_SIZE
  }

  const keywords = [...counts.entries()]
    .sort(([nameA, countA], [nameB, countB]) => countB - countA || nameA.localeCompare(nameB, 'ko'))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }))

  const frequencies = Object.fromEntries(freqCounts)

  return NextResponse.json(
    { keywords, frequencies },
    { headers: { 'Cache-Control': 'private, max-age=300' } }
  )
}
