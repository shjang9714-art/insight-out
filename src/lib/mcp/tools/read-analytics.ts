import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveBriefingAudioUrl } from '@/lib/briefing/audio-url'
import { getPublishedReports, getReport } from '@/lib/reports/query'
import { getPublishedCompetitorWeeklyReports, getCompetitorWeeklyReportByWeek } from '@/lib/competitor-weekly/query'
import { getPublishedCompanyDocuments } from '@/lib/company-docs/query'
import { ok, fail, dbError, forbidden } from '@/lib/mcp/result'
import { actorFrom, hasScope } from '@/lib/mcp/auth'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'
import type { CompanyDocumentType } from '@/lib/types'

function guard(extra: unknown) {
  const actor = actorFrom(extra)
  if (!actor) return { err: fail('인증 정보를 확인할 수 없습니다.') }
  if (!hasScope(actor, 'read')) return { err: forbidden('read') }
  return { actor }
}

function textValue(value: unknown): string {
  if (value == null) return '-'
  if (typeof value === 'string') return value
  try { return JSON.stringify(value) } catch { return String(value) }
}

function rowsText(rows: unknown[], empty = '조회된 데이터가 없습니다.'): string {
  return rows.length ? rows.map(row => textValue(row)).join('\n\n') : empty
}

const COMPANY_DOC_TYPES: [CompanyDocumentType, ...CompanyDocumentType[]] = [
  '회사소개', 'IR·실적', '전략·보고서', 'ESG', '기술·제품', '투자·피치덱', '행사·발표',
]

export function registerAnalyticsReadTools(server: McpServer) {
  server.registerTool('ai_report_list', {
    title: '발행 AI 리포트 목록',
    description: '발행된 AI 전략 리포트만 조회합니다. 반환된 id를 report_get에서 상세 근거로 사용할 수 있습니다.',
    inputSchema: { limit: z.number().int().min(1).max(50).optional() },
  }, async ({ limit }, extra) => {
    const g = guard(extra); if (g.err) return g.err
    try {
      const reports = await getPublishedReports(createAdminClient())
      return ok(rowsText(reports.slice(0, limit ?? 20).map(report => ({
        id: report.id, title: report.title, summary: report.summary,
        type: report.type, publisher: report.publisher, published_at: report.published_at,
        keywords: report.keywords,
      }))))
    } catch (error) { return dbError(error, 'ai_reports') }
  })

  server.registerTool('ai_report_get', {
    title: '발행 AI 리포트 상세',
    description: '발행된 AI 리포트 한 건의 본문과 안전한 메타데이터를 조회합니다. 미발행 리포트는 반환하지 않습니다.',
    inputSchema: { id: z.string().uuid() },
  }, async ({ id }, extra) => {
    const g = guard(extra); if (g.err) return g.err
    try {
      const report = await getReport(createAdminClient(), id)
      if (!report || !report.published_at) return ok('미발행 리포트이거나 존재하지 않습니다.')
      return ok(textValue({
        id: report.id, title: report.title, summary: report.summary ? stripLlmArtifacts(report.summary) : null,
        type: report.type, publisher: report.publisher, published_at: report.published_at,
        topic: report.topic, body_md: report.body_md, body_html: report.body_html, keywords: report.keywords,
      }))
    } catch (error) { return dbError(error, 'ai_reports') }
  })

  server.registerTool('competitor_weekly_list', {
    title: '경쟁사 주간 리포트 목록',
    description: '발행된 경쟁사 주간 리포트만 조회합니다. sections의 citations로 근거 콘텐츠를 연결할 수 있습니다.',
    inputSchema: { limit: z.number().int().min(1).max(30).optional() },
  }, async ({ limit }, extra) => {
    const g = guard(extra); if (g.err) return g.err
    try {
      const reports = await getPublishedCompetitorWeeklyReports(createAdminClient(), limit ?? 12)
      return ok(rowsText(reports.map(report => ({
        id: report.id, week_start: report.week_start, week_end: report.week_end,
        summary: report.summary, overall_impact: report.overall_impact,
        emerging_topics: report.emerging_topics, sections: report.sections,
      }))))
    } catch (error) { return dbError(error, 'competitor_weekly_reports') }
  })

  server.registerTool('competitor_weekly_get', {
    title: '경쟁사 주간 리포트 상세',
    description: 'week_start(YYYY-MM-DD)에 해당하는 발행 경쟁사 주간 리포트를 조회합니다.',
    inputSchema: { week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) },
  }, async ({ week_start }, extra) => {
    const g = guard(extra); if (g.err) return g.err
    try {
      const report = await getCompetitorWeeklyReportByWeek(createAdminClient(), week_start)
      return ok(report ? textValue({
        id: report.id, week_start: report.week_start, week_end: report.week_end,
        summary: report.summary, overall_impact: report.overall_impact,
        emerging_topics: report.emerging_topics, sections: report.sections,
      }) : '해당 주의 발행 리포트가 없습니다.')
    } catch (error) { return dbError(error, 'competitor_weekly_reports') }
  })

  server.registerTool('daily_insight_list', {
    title: '데일리 인사이트 목록',
    description: '검토를 마친 발행 데일리 인사이트만 조회합니다.',
    inputSchema: { limit: z.number().int().min(1).max(50).optional() },
  }, async ({ limit }, extra) => {
    const g = guard(extra); if (g.err) return g.err
    try {
      const { data, error } = await createAdminClient().from('daily_insights')
        .select('id, day_of, category, headline, summary_ko, market_trend, competitor_trend, implication, why_it_matters, implication_lenses, next_steps, source_articles')
        .eq('status', 'published').eq('needs_review', false)
        .order('day_of', { ascending: false }).limit(limit ?? 20)
      if (error) return dbError(error, 'daily_insights')
      return ok(rowsText(data ?? []))
    } catch (error) { return dbError(error, 'daily_insights') }
  })

  server.registerTool('daily_insight_get', {
    title: '데일리 인사이트 상세',
    description: '발행되고 검토 완료된 데일리 인사이트 한 건을 조회합니다.',
    inputSchema: { id: z.string().uuid() },
  }, async ({ id }, extra) => {
    const g = guard(extra); if (g.err) return g.err
    try {
      const { data, error } = await createAdminClient().from('daily_insights')
        .select('id, day_of, category, headline, summary_ko, market_trend, competitor_trend, implication, why_it_matters, implication_lenses, next_steps, source_articles')
        .eq('id', id).eq('status', 'published').eq('needs_review', false).maybeSingle()
      if (error) return dbError(error, 'daily_insights')
      return ok(data ? textValue(data) : '발행된 데일리 인사이트가 없습니다.')
    } catch (error) { return dbError(error, 'daily_insights') }
  })

  server.registerTool('briefing_list', {
    title: '모닝브리핑 목록',
    description: '발행 또는 보관된 모닝브리핑만 조회합니다.',
    inputSchema: { limit: z.number().int().min(1).max(30).optional() },
  }, async ({ limit }, extra) => {
    const g = guard(extra); if (g.err) return g.err
    try {
      const { data, error } = await createAdminClient().from('briefings')
        .select('id, briefing_date, title, script, audio_url, audio_duration_seconds, highlights')
        .in('status', ['published', 'archived']).order('briefing_date', { ascending: false }).limit(limit ?? 20)
      if (error) return dbError(error, 'briefings')
      return ok(rowsText((data ?? []).map(resolveBriefingAudioUrl)))
    } catch (error) { return dbError(error, 'briefings') }
  })

  server.registerTool('briefing_get', {
    title: '모닝브리핑 상세',
    description: '발행 또는 보관된 모닝브리핑 한 건의 스크립트와 하이라이트를 조회합니다.',
    inputSchema: { id: z.string().uuid() },
  }, async ({ id }, extra) => {
    const g = guard(extra); if (g.err) return g.err
    try {
      const { data, error } = await createAdminClient().from('briefings')
        .select('id, briefing_date, title, script, audio_url, audio_duration_seconds, highlights')
        .eq('id', id).in('status', ['published', 'archived']).maybeSingle()
      if (error) return dbError(error, 'briefings')
      return ok(data ? textValue(resolveBriefingAudioUrl(data)) : '발행된 모닝브리핑이 없습니다.')
    } catch (error) { return dbError(error, 'briefings') }
  })

  server.registerTool('newsletter_list', {
    title: '발송 뉴스레터 목록',
    description: '발송 완료 또는 일부 발송된 뉴스레터만 최신순으로 조회합니다. 수신자 개인 정보는 포함하지 않습니다.',
    inputSchema: { limit: z.number().int().min(1).max(50).optional() },
  }, async ({ limit }, extra) => {
    const g = guard(extra); if (g.err) return g.err
    try {
      const { data, error } = await createAdminClient().from('newsletter_issues')
        .select('id, sent_on, subject, recipient_cnt')
        .in('status', ['sent', 'partial'])
        .order('sent_on', { ascending: false })
        .limit(limit ?? 20)
      if (error) return dbError(error, 'newsletter_issues')
      return ok(rowsText(data ?? [], '발송된 뉴스레터가 없습니다.'))
    } catch (error) { return dbError(error, 'newsletter_issues') }
  })

  server.registerTool('newsletter_get', {
    title: '발송 뉴스레터 상세',
    description: '발송된 뉴스레터 한 건의 제목·날짜·수록 기사 id·발송 본문(payload)을 조회합니다. content_ids의 각 기사는 content_get으로 연결할 수 있으며 수신자 정보는 포함하지 않습니다.',
    inputSchema: { id: z.string().uuid() },
  }, async ({ id }, extra) => {
    const g = guard(extra); if (g.err) return g.err
    try {
      const { data, error } = await createAdminClient().from('newsletter_issues')
        .select('id, sent_on, subject, content_ids, payload')
        .eq('id', id)
        .in('status', ['sent', 'partial'])
        .maybeSingle()
      if (error) return dbError(error, 'newsletter_issues')
      return ok(data ? textValue(data) : '발송되지 않은 뉴스레터이거나 존재하지 않습니다.')
    } catch (error) { return dbError(error, 'newsletter_issues') }
  })

  server.registerTool('entity_events', {
    title: '기업 엔티티 이벤트',
    description: '발행 기사 기반 확정 이벤트 타임라인을 entity_id로만 조회합니다. 전체 이벤트 덤프는 지원하지 않습니다.',
    inputSchema: { entity_id: z.string().uuid(), limit: z.number().int().min(1).max(100).optional() },
  }, async ({ entity_id, limit }, extra) => {
    const g = guard(extra); if (g.err) return g.err
    try {
      const { data, error } = await createAdminClient().from('entity_events')
        .select('event_date, signal_type, headline, detail, biz_impact, biz_impact_reason, citations')
        .eq('entity_id', entity_id).order('event_date', { ascending: false }).limit(limit ?? 50)
      if (error) return dbError(error, 'entity_events')
      return ok(rowsText(data ?? []))
    } catch (error) { return dbError(error, 'entity_events') }
  })

  server.registerTool('company_document_list', {
    title: '공개 기업 문서 목록',
    description: '공개 범위이고 검토 완료된 기업 문서·DART 자료만 조회합니다.',
    inputSchema: {
      entity_id: z.string().uuid().optional(),
      doc_type: z.enum(COMPANY_DOC_TYPES).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    },
  }, async ({ entity_id, doc_type, limit }, extra) => {
    const g = guard(extra); if (g.err) return g.err
    try {
      const documents = await getPublishedCompanyDocuments(createAdminClient(), {
        entityId: entity_id, docType: doc_type, limit: limit ?? 30,
      })
      return ok(rowsText(documents.map(document => ({
        content_id: document.contentId, title: document.title, summary_ko: document.summaryKo,
        original_url: document.originalUrl, published_on: document.publishedAt,
        entityName: document.entityName, doc_type: document.docType, is_official: document.isOfficial,
      }))))
    } catch (error) { return dbError(error, 'company_documents') }
  })

  server.registerTool('company_document_get', {
    title: '공개 기업 문서 상세',
    description: 'content_id로 공개 범위이고 검토 완료된 기업 문서 한 건을 조회합니다.',
    inputSchema: { content_id: z.string().uuid() },
  }, async ({ content_id }, extra) => {
    const g = guard(extra); if (g.err) return g.err
    try {
      const documents = await getPublishedCompanyDocuments(createAdminClient(), { contentId: content_id, limit: 1 })
      const document = documents[0]
      return ok(document ? textValue({
        content_id: document.contentId, title: document.title, summary_ko: document.summaryKo,
        original_url: document.originalUrl, published_on: document.publishedAt,
        entityName: document.entityName, doc_type: document.docType, is_official: document.isOfficial,
      }) : '공개된 기업 문서가 없습니다.')
    } catch (error) { return dbError(error, 'company_documents') }
  })
}
