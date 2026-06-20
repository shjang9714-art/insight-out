import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { AiReportType } from '@/lib/types'

const REPORT_TYPES: AiReportType[] = ['시장동향', '경쟁사분석', '키워드분석', '서비스리포트', '자유주제']

interface GenerateBody {
  type: AiReportType
  title?: string
  issueIds?: string[]
  contentIds?: string[]
}

interface IssueStat {
  id: string
  title: string
  summary: string | null
  contentCount: number
  categoryDist: Record<string, number>
  sentimentPos: number
  sentimentNeu: number
  sentimentNeg: number
  topEntities: string[]
  topContentIds: string[]
}

interface ContentRow {
  id: string
  title: string
  summary_ko: string | null
  sentiment: '긍정' | '중립' | '부정' | null
}

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function assembleMd(
  reportType: AiReportType,
  reportTitle: string,
  issues: IssueStat[],
  selectedContents: ContentRow[],
  allSourceTitles: { id: string; title: string }[],
): string {
  const lines: string[] = []

  lines.push(`# ${reportTitle}`)
  lines.push('')
  lines.push('## 1. 개요')

  const overview: string[] = []
  if (issues.length > 0) {
    overview.push(`이슈 ${issues.length}건(${issues.map(i => i.title).join(', ')})`)
  }
  if (selectedContents.length > 0) {
    overview.push(`콘텐츠 ${selectedContents.length}건`)
  }
  lines.push(`대상: ${overview.join(' + ')} 분석 — ${today()} 기준`)
  lines.push('')

  if (issues.length > 0) {
    lines.push('## 2. 이슈별 동향')
    lines.push('')
    for (const iss of issues) {
      lines.push(`### ${iss.title}`)
      if (iss.summary) {
        lines.push('')
        lines.push(iss.summary)
      }
      lines.push('')
      const catParts = Object.entries(iss.categoryDist)
        .map(([cat, n]) => `${cat} ${n}`)
        .join('·')
      lines.push(`- 관련 콘텐츠 ${iss.contentCount}건${catParts ? `(${catParts})` : ''}`)
      lines.push(`- 논조: 긍 ${iss.sentimentPos} / 중 ${iss.sentimentNeu} / 부 ${iss.sentimentNeg}`)
      if (iss.topEntities.length > 0) {
        lines.push(`- 관련 엔티티: ${iss.topEntities.join(', ')}`)
      }
      lines.push('')
    }
  }

  if (selectedContents.length > 0) {
    if (issues.length === 0) {
      lines.push('## 2. 선택 콘텐츠 요약')
      lines.push('')
    } else {
      lines.push('## 2-B. 선택 콘텐츠 요약')
      lines.push('')
    }
    for (const c of selectedContents) {
      lines.push(`### ${c.title}`)
      if (c.summary_ko) {
        lines.push('')
        lines.push(c.summary_ko)
      }
      if (c.sentiment) {
        lines.push(`- 논조: ${c.sentiment}`)
      }
      lines.push('')
    }
  }

  lines.push('## 3. 시사점 (LG U+ 관점)')
  lines.push('')
  lines.push('> 작성 필요 — 위 동향에서 사업 시사점 1~3개')
  lines.push('')
  lines.push('## 4. 기회 / 리스크')
  lines.push('')
  lines.push('> 작성 필요')
  lines.push('')
  lines.push('## 5. 대응 방향')
  lines.push('')
  lines.push('> 작성 필요')
  lines.push('')

  if (allSourceTitles.length > 0) {
    lines.push('## 근거 콘텐츠')
    lines.push('')
    for (const s of allSourceTitles) {
      lines.push(`- ${s.title}`)
    }
  }

  return lines.join('\n')
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(toSet) {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  let body: GenerateBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const { type, title, issueIds = [], contentIds = [] } = body

  if (!REPORT_TYPES.includes(type)) {
    return NextResponse.json({ error: '유효하지 않은 보고서 유형입니다.' }, { status: 400 })
  }
  if (issueIds.length === 0 && contentIds.length === 0) {
    return NextResponse.json({ error: '이슈 또는 콘텐츠를 하나 이상 선택해주세요.' }, { status: 400 })
  }

  // ── 이슈별 통계 수집 ──────────────────────────────────────────────────────
  const issueStats: IssueStat[] = []
  const issueContentIds: string[] = []

  for (const issueId of issueIds) {
    const { data: issueData } = await supabase
      .from('issues')
      .select('id, title, summary')
      .eq('id', issueId)
      .single()

    if (!issueData) continue

    const { data: icRows } = await supabase
      .from('issue_contents')
      .select('content_id, contents(id, title, category, sentiment)')
      .eq('issue_id', issueId)
      .limit(50)

    interface IcRow {
      content_id: string
      contents: { id: string; title: string; category: string | null; sentiment: '긍정' | '중립' | '부정' | null } | null
    }
    const rows = (icRows ?? []) as unknown as IcRow[]

    const categoryDist: Record<string, number> = {}
    let pos = 0, neu = 0, neg = 0
    const topContentIds: string[] = []

    for (const r of rows) {
      const c = r.contents
      if (!c) continue
      topContentIds.push(c.id)
      if (c.category) categoryDist[c.category] = (categoryDist[c.category] ?? 0) + 1
      if (c.sentiment === '긍정') pos++
      else if (c.sentiment === '부정') neg++
      else neu++
    }

    // 상위 엔티티 (빈도 top 5)
    const topContentSample = topContentIds.slice(0, 20)
    const entityMap: Record<string, string> = {}
    if (topContentSample.length > 0) {
      const { data: ceRows } = await supabase
        .from('content_entities')
        .select('entity_id, entities(canonical_name)')
        .in('content_id', topContentSample)

      interface CeRow {
        entity_id: string
        entities: { canonical_name: string } | null
      }
      const ceData = (ceRows ?? []) as unknown as CeRow[]
      const freq: Record<string, number> = {}
      for (const ce of ceData) {
        if (!ce.entities) continue
        const name = ce.entities.canonical_name
        freq[name] = (freq[name] ?? 0) + 1
        entityMap[name] = name
      }
      const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5)
      issueStats.push({
        id: issueData.id,
        title: issueData.title,
        summary: issueData.summary,
        contentCount: rows.length,
        categoryDist,
        sentimentPos: pos,
        sentimentNeu: neu,
        sentimentNeg: neg,
        topEntities: sorted.map(([name]) => name),
        topContentIds: topContentIds.slice(0, 10),
      })
    } else {
      issueStats.push({
        id: issueData.id,
        title: issueData.title,
        summary: issueData.summary,
        contentCount: rows.length,
        categoryDist,
        sentimentPos: pos,
        sentimentNeu: neu,
        sentimentNeg: neg,
        topEntities: [],
        topContentIds: topContentIds.slice(0, 10),
      })
    }

    issueContentIds.push(...topContentIds.slice(0, 10))
  }

  // ── 선택 콘텐츠 수집 ─────────────────────────────────────────────────────
  let selectedContents: ContentRow[] = []
  if (contentIds.length > 0) {
    const { data: cRows } = await supabase
      .from('contents')
      .select('id, title, summary_ko, sentiment')
      .in('id', contentIds)

    selectedContents = (cRows ?? []) as ContentRow[]
  }

  // ── 근거 content_id 집합 ─────────────────────────────────────────────────
  const sourceContentIds = Array.from(new Set([...contentIds, ...issueContentIds]))

  // 근거 콘텐츠 제목 (markdown 목록용)
  const allSourceTitles: { id: string; title: string }[] = []
  if (sourceContentIds.length > 0) {
    const { data: titleRows } = await supabase
      .from('contents')
      .select('id, title')
      .in('id', sourceContentIds)
    for (const r of (titleRows ?? [])) {
      allSourceTitles.push({ id: r.id, title: r.title })
    }
  }

  // ── 보고서 제목 ──────────────────────────────────────────────────────────
  const reportTitle = (title?.trim()) || `${type} 보고서 — ${today()}`

  // ── 본문 조립 ────────────────────────────────────────────────────────────
  const bodyMd = assembleMd(type, reportTitle, issueStats, selectedContents, allSourceTitles)

  // ── prompt 요약 ──────────────────────────────────────────────────────────
  const promptParts: string[] = []
  if (issueStats.length > 0) {
    promptParts.push(`이슈: ${issueStats.map(i => i.title).join(', ')}`)
  }
  if (selectedContents.length > 0) {
    promptParts.push(`콘텐츠 ${selectedContents.length}건`)
  }
  const prompt = promptParts.join(' + ') || '자동 조립'

  // ── ai_reports 저장 ──────────────────────────────────────────────────────
  const { data: inserted, error: insertErr } = await supabase
    .from('ai_reports')
    .insert({
      user_id: user.id,
      type,
      status: 'draft',
      title: reportTitle,
      prompt,
      body_md: bodyMd,
    })
    .select('id')
    .single()

  if (insertErr || !inserted) {
    console.error('[generate] insert error:', insertErr)
    return NextResponse.json({ error: '보고서 저장에 실패했습니다. 잠시 후 다시 시도해주세요.' }, { status: 500 })
  }

  const reportId = inserted.id

  // ── ai_report_sources 저장 ───────────────────────────────────────────────
  if (sourceContentIds.length > 0) {
    const sourceRows = sourceContentIds.map((cid) => ({
      ai_report_id: reportId,
      content_id: cid,
    }))
    const { error: srcErr } = await supabase.from('ai_report_sources').insert(sourceRows)
    if (srcErr) console.error('[generate] ai_report_sources insert error:', srcErr)
  }

  return NextResponse.json({ id: reportId })
}
