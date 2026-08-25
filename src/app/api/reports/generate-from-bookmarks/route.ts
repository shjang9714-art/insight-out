import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateStrategyReport } from '@/lib/reports/generate-strategy'
import { getKstTodayStartIso } from '@/lib/date'
import type { AiReportType } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const REPORT_TYPES: AiReportType[] = ['시장동향', '경쟁사분석', '키워드분석', '서비스리포트', '자유주제']

/** 사용자당 하루 보고서 생성 한도(David 확정, 574). 새 테이블 없이 ai_reports.created_at 으로 센다. */
const DAILY_REPORT_LIMIT = 3

interface GenerateFromBookmarksBody {
  bookmarkIds?: unknown
  topic?: unknown
  title?: unknown
  type?: unknown
}

/**
 * POST /api/reports/generate-from-bookmarks
 * body: { bookmarkIds: string[], topic: string, title?: string, type: AiReportType }
 * 북마크에서 content_id 를 뽑아 generateStrategyReport(어드민 기능이 아닌 사용자 기능, 574)
 * 에 근거로 넘긴다. 행 생성·근거 연결은 생성기가 전담한다.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
    }

    let body: GenerateFromBookmarksBody
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const type = body.type as AiReportType | undefined
    if (!type || !REPORT_TYPES.includes(type)) {
      return NextResponse.json({ error: '유효하지 않은 보고서 유형입니다.' }, { status: 400 })
    }
    const topic = typeof body.topic === 'string' ? body.topic.trim() : ''
    if (!topic) {
      return NextResponse.json({ error: '주제를 입력해주세요.' }, { status: 400 })
    }
    const title = typeof body.title === 'string' ? body.title : undefined
    const bookmarkIds = Array.isArray(body.bookmarkIds)
      ? body.bookmarkIds.filter((id): id is string => typeof id === 'string')
      : []
    if (bookmarkIds.length === 0) {
      return NextResponse.json({ error: '북마크를 1개 이상 선택해주세요.' }, { status: 400 })
    }

    // 🔴 소유 확인 — bookmarkIds 를 믿지 않는다. 세션 클라이언트(RLS) + user_id 명시 조건을
    // 한 번 더 건다. admin 클라이언트로 조회하면 남의 북마크가 통째로 열린다.
    const { data: rows, error: bookmarkError } = await supabase
      .from('bookmarks')
      .select('id, content_id')
      .in('id', bookmarkIds)
      .eq('user_id', user.id)

    if (bookmarkError) {
      console.error('[generate-from-bookmarks] 북마크 조회 실패:', bookmarkError.message)
      return NextResponse.json({ error: '북마크 조회에 실패했습니다.' }, { status: 500 })
    }

    // bookmarks 는 5종 타겟(content_id·youtube_video_id·ai_report_id·daily_insight_id·
    // insight_card_id)을 가진다. 생성기는 contentIds 만 받으므로 나머지는 근거가 되지 못한다.
    const contentIds = (rows ?? [])
      .map((r) => r.content_id)
      .filter((id): id is string => Boolean(id))
    const droppedItems = bookmarkIds.length - contentIds.length

    if (contentIds.length === 0) {
      return NextResponse.json(
        { error: '선택한 북마크 중 보고서 근거로 쓸 수 있는 콘텐츠가 없습니다. 뉴스·리포트 등 콘텐츠 북마크를 선택해주세요.' },
        { status: 400 },
      )
    }

    // 🔴 한도 — 사용자당 하루 3건(KST 기준). 새 테이블 없이 ai_reports.user_id + created_at 으로
    // 센다. 카운트는 admin 클라이언트로 한다 — RLS 로도 본인 것만 세이지만, 세션 클라이언트로
    // 세면 정책 변경에 취약하다. 조회(북마크·보고서)는 절대 admin 으로 하지 않는다.
    const admin = createAdminClient()
    const dayStartIso = getKstTodayStartIso()
    const { count, error: countError } = await admin
      .from('ai_reports')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', dayStartIso)
      .neq('status', 'failed')

    if (countError) {
      console.error('[generate-from-bookmarks] 한도 조회 실패:', countError.message)
      return NextResponse.json({ error: '요청 한도 확인에 실패했습니다.' }, { status: 500 })
    }

    if ((count ?? 0) >= DAILY_REPORT_LIMIT) {
      const resetAt = new Date(new Date(dayStartIso).getTime() + 24 * 60 * 60 * 1000).toISOString()
      return NextResponse.json(
        {
          error: `하루 보고서 생성 한도(${DAILY_REPORT_LIMIT}건)를 모두 사용했습니다. 자정(KST) 이후 다시 시도해주세요.`,
          resetAt,
        },
        { status: 429 },
      )
    }

    // 생성기 자체는 admin 클라이언트를 요구한다(내부에서 insert 를 한다) — 정상이다.
    // 위험한 건 조회를 admin 으로 하는 것이지, 생성기에 admin 을 넘기는 게 아니다.
    const result = await generateStrategyReport(admin, {
      userId: user.id,
      type,
      topic,
      title,
      contentIds,
    })

    // generateStrategyReport 는 예외를 던지지 않는다 — LLM 실패 시에도 status:'failed' 행을
    // 저장하고 정상 반환한다. 이 판정이 없으면 실패가 200 ok:true 로 보인다(조용한 성공).
    // 실패 행은 지우지 않는다 — 진단용으로 DB 에 남긴다.
    if (result.status === 'failed') {
      return NextResponse.json(
        {
          error: result.error ?? '보고서 생성에 실패했습니다. 잠시 후 다시 시도해주세요.',
          reportId: result.reportId,
        },
        { status: 502 },
      )
    }

    return NextResponse.json({
      ok: true,
      reportId: result.reportId,
      usedSources: contentIds.length,
      droppedItems,
    })
  } catch (err) {
    console.error('[generate-from-bookmarks]', err)
    return NextResponse.json({ error: '보고서 생성 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
