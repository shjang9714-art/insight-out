import type { NewsGroupKey } from '@/lib/newsletter/news-groups'
import type { CardInsight } from '@/lib/newsletter/card-insights'
import type { RelatedArticle } from '@/lib/newsletter/related-articles'

export interface NewsletterCard {
  title: string
  category: string
  sourceName: string | null
  summaryKo: string | null
  detailUrl: string
  originalUrl: string | null
  /** 과거 payload(`newsletter_issues.payload`)는 문자열 인사이트를 담고 있을 수 있다 — 하위호환. */
  insight: CardInsight | string | null
  relatedArticles?: RelatedArticle[]
}

export interface NewsletterNewsGroup {
  key: NewsGroupKey
  label: string
  cards: NewsletterCard[]
}

export interface NewsletterTopTeaserFlowStep {
  phase: string
  text: string
  sourceUrl: string | null
  sourceName: string | null
}

export interface NewsletterTopTeaserFlow {
  type: 'flow'
  headline: string | null
  steps: NewsletterTopTeaserFlowStep[]
}

export interface NewsletterTopTeaserInsight {
  type: 'insight'
  headline: string
  summaryKo: string
  detailUrl: string
}

export type NewsletterTopTeaser = NewsletterTopTeaserFlow | NewsletterTopTeaserInsight

export interface NewsletterKnowledgeReport {
  category: string
  title: string
  teaser: string
  detailUrl: string
}

export interface NewsletterEmailData {
  dateLabel: string
  issueNo: number
  greetingName: string | null
  newsGroups: NewsletterNewsGroup[]
  topTeaser: NewsletterTopTeaser | null
  knowledgeReports: NewsletterKnowledgeReport[]
  unsubscribeUrl: string
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function buildTopTeaserInsightSection(data: NewsletterTopTeaserInsight): string {
  return `
  <tr>
    <td style="padding:18px 44px 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fdf5f9; border-radius:14px;">
        <tr>
          <td style="padding:24px 26px;">
            <p style="margin:0 0 10px; font-size:11px; font-weight:700; letter-spacing:0.12em; color:#c2185b;">🧭 주간 핵심 인사이트</p>
            <p style="margin:0 0 10px; font-size:19px; font-weight:800; line-height:1.5; color:#1a1a1e;">${escapeHtml(data.headline)}</p>
            <p style="margin:0 0 18px; font-size:14px; line-height:1.8; color:#4a4f57;">💡 ${escapeHtml(data.summaryKo)}</p>
            <a href="${data.detailUrl}" style="display:inline-block; font-size:13px; font-weight:700; color:#ffffff; background:#E6007E; padding:11px 20px; border-radius:10px; text-decoration:none;">인사이트 전문 보기 →</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>`
}

function buildTopTeaserFlowSection(data: NewsletterTopTeaserFlow): string {
  const stepsHtml = data.steps
    .map((step, i, arr) => {
      const isLast = i === arr.length - 1
      const body = step.sourceUrl
        ? `<a href="${step.sourceUrl}" style="color:#111827; text-decoration:none;">${escapeHtml(step.text)}</a>`
        : escapeHtml(step.text)
      return `
        <tr>
          <td width="26" valign="top" style="padding:0 0 ${isLast ? '0' : '14px'};">
            <span style="display:inline-block; width:20px; height:20px; line-height:20px; text-align:center; font-size:11px; font-weight:700; color:#E6007E; background:#fce7f0; border-radius:999px;">${i + 1}</span>
          </td>
          <td valign="top" style="padding:0 0 ${isLast ? '0' : '14px'};">
            <p style="margin:0 0 3px; font-size:10.5px; font-weight:700; letter-spacing:0.06em; color:#E6007E; text-transform:uppercase;">${escapeHtml(step.phase)}</p>
            <p style="margin:0; font-size:13.5px; line-height:1.6; color:#374151;">${body}</p>
            ${step.sourceName ? `<p style="margin:2px 0 0; font-size:11px; color:#9ca3af;">${escapeHtml(step.sourceName)}</p>` : ''}
          </td>
        </tr>`
    })
    .join('')

  return `
  <tr>
    <td style="padding:18px 44px 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fdf5f9; border-radius:14px;">
        <tr>
          <td style="padding:24px 26px;">
            <p style="margin:0 0 10px; font-size:11px; font-weight:700; letter-spacing:0.12em; color:#c2185b;">🧭 이번 주 핵심 흐름</p>
            ${data.headline ? `<p style="margin:0 0 18px; font-size:19px; font-weight:800; line-height:1.5; color:#1a1a1e;">${escapeHtml(data.headline)}</p>` : ''}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${stepsHtml}
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>`
}

function buildTopTeaserSection(data: NewsletterEmailData['topTeaser']): string {
  if (!data) return ''
  return data.type === 'flow' ? buildTopTeaserFlowSection(data) : buildTopTeaserInsightSection(data)
}

const RELATED_TITLE_MAX_LENGTH = 45

function truncateTitle(title: string): string {
  return title.length > RELATED_TITLE_MAX_LENGTH ? `${title.slice(0, RELATED_TITLE_MAX_LENGTH)}…` : title
}

/** 인사이트 라벨 행 하나(2열 테이블 — Outlook 대응상 flex·grid 대신 table 로 정렬). */
function buildInsightRow(label: string, body: string, isLast: boolean): string {
  return `
                          <tr>
                            <td width="76" valign="top" style="padding:0 12px ${isLast ? '0' : '12px'} 0; font-size:12.5px; font-weight:700; color:#9d3d6d; line-height:1.75; white-space:nowrap;">${escapeHtml(label)}</td>
                            <td valign="top" style="padding:0 0 ${isLast ? '0' : '12px'}; font-size:13px; line-height:1.8; color:#4a4f57;">${escapeHtml(body)}</td>
                          </tr>`
}

/** 인사이트 블록. why·action 둘 다 없으면 아무것도 그리지 않는다. 과거 문자열 payload 는 한 줄로 렌더(하위호환). */
function buildInsightBlock(insight: NewsletterCard['insight']): string {
  if (!insight) return ''

  if (typeof insight === 'string') {
    if (!insight.trim()) return ''
    return `
            <p style="margin:0 0 8px; font-size:12.5px; line-height:1.6; color:#4b5563; border-top:1px dashed #eef0f3; padding-top:8px;">💡 <span style="color:#E6007E; font-weight:700;">인사이트 ·</span> ${escapeHtml(insight)}</p>`
  }

  if (!insight.why && !insight.action) return ''

  const rowDefs: { label: string; body: string }[] = []
  if (insight.why) rowDefs.push({ label: '짚어보면', body: insight.why })
  if (insight.action) rowDefs.push({ label: '그래서 U+는', body: insight.action })

  const rows = rowDefs
    .map(({ label, body }, idx) => buildInsightRow(label, body, idx === rowDefs.length - 1))
    .join('')

  return `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf9fa; border-radius:12px;">
              <tr>
                <td style="padding:16px 18px 14px;">
                  <p style="margin:0 0 12px; font-size:11px; font-weight:700; letter-spacing:0.1em; color:#a3a7ae;">INSIGHT</p>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}
                  </table>
                </td>
              </tr>
            </table>`
}

/** 관련 기사 블록. 배열이 비었거나 undefined 면 소제목 포함 전체를 렌더하지 않는다. */
function buildRelatedArticlesBlock(articles: RelatedArticle[] | undefined): string {
  if (!articles || articles.length === 0) return ''

  const items = articles
    .map(
      (a) => `
        <tr>
          <td style="padding:0 0 5px; font-size:12.5px; line-height:1.7;">
            <span style="color:#c8ccd2;">—</span> <a href="${a.detailUrl}" style="color:#63696f; text-decoration:none;">${escapeHtml(truncateTitle(a.title))}</a>${a.sourceName ? ` <span style="color:#a3a7ae;">(${escapeHtml(a.sourceName)})</span>` : ''}
          </td>
        </tr>`
    )
    .join('')

  return `
            <p style="margin:14px 0 6px; font-size:11px; font-weight:700; letter-spacing:0.06em; color:#a3a7ae;">관련 기사</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}
            </table>`
}

function buildNewsCardItem(card: NewsletterCard, i: number, isLast: boolean): string {
  return `
  <tr>
    <td style="padding:16px 0 22px;${isLast ? '' : ' border-bottom:1px solid #f4f4f6;'}">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td width="38" valign="top">
            <span style="display:inline-block; width:26px; height:26px; line-height:26px; text-align:center; font-size:12px; font-weight:700; color:#c2185b; background:#fdeaf3; border-radius:999px;">${i + 1}</span>
          </td>
          <td valign="top">
            <p style="margin:0 0 6px; font-size:11px; color:#a3a7ae; letter-spacing:0.02em;"><span style="color:#c2185b; font-weight:700;">${escapeHtml(card.category)}</span>${card.sourceName ? ` · ${escapeHtml(card.sourceName)}` : ''}</p>
            <p style="margin:0 0 8px; font-size:16px; font-weight:700; line-height:1.55; color:#1a1a1e;">${escapeHtml(card.title)}</p>
            ${card.summaryKo ? `<p style="margin:0 0 14px; font-size:13.5px; line-height:1.8; color:#63696f;">${escapeHtml(card.summaryKo)} <a href="${card.detailUrl}" style="font-size:12.5px; font-weight:700; color:#E6007E; text-decoration:none; white-space:nowrap;">자세히&nbsp;보기&nbsp;→</a></p>` : `<p style="margin:0 0 14px;"><a href="${card.detailUrl}" style="font-size:12.5px; font-weight:700; color:#E6007E; text-decoration:none; white-space:nowrap;">자세히&nbsp;보기&nbsp;→</a></p>`}
            ${buildInsightBlock(card.insight)}
            ${buildRelatedArticlesBlock(card.relatedArticles)}
          </td>
        </tr>
      </table>
    </td>
  </tr>`
}

function buildNewsGroupBlock(group: NewsletterNewsGroup): string {
  const body =
    group.cards.length > 0
      ? group.cards.map((card, i) => buildNewsCardItem(card, i, i === group.cards.length - 1)).join('')
      : `
  <tr>
    <td style="padding:10px 0 18px;">
      <p style="margin:0; font-size:12.5px; color:#9ca3af;">금일 해당 카테고리 기사 없음</p>
    </td>
  </tr>`

  return `
  <tr>
    <td style="padding:0;">
      <p style="margin:26px 0 0; font-size:12.5px; font-weight:700; color:#1a1a1e;">${escapeHtml(group.label)}</p>
    </td>
  </tr>${body}`
}

function buildNewsCardsSection(groups: NewsletterNewsGroup[]): string {
  if (groups.length === 0) return ''

  const blocks = groups.map(buildNewsGroupBlock).join('')

  return `
  <tr>
    <td style="padding:32px 44px 0;">
      <p style="margin:0; font-size:13px; font-weight:800; letter-spacing:0.06em; color:#1a1a1e; border-left:3px solid #E6007E; padding-left:11px;">📌 오늘의 주요 뉴스</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${blocks}
      </table>
    </td>
  </tr>`
}

function buildKnowledgeReportsSection(reports: NewsletterKnowledgeReport[]): string {
  if (reports.length === 0) return ''

  const cards = reports
    .map(
      (r, i) => `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb; border:1px solid #eef0f3; border-radius:10px; ${i < reports.length - 1 ? 'margin-bottom:10px;' : ''}">
        <tr>
          <td style="padding:16px 18px;">
            <p style="margin:0 0 4px; font-size:10px; font-weight:700; letter-spacing:0.08em; color:#8b5cf6;">${escapeHtml(r.category)}</p>
            <p style="margin:0 0 4px; font-size:14.5px; font-weight:700; color:#111827; line-height:1.4;">${escapeHtml(r.title)}</p>
            ${r.teaser ? `<p style="margin:0 0 10px; font-size:12.5px; color:#6b7280; line-height:1.6;">${escapeHtml(r.teaser)}</p>` : ''}
            <a href="${r.detailUrl}" style="font-size:12px; font-weight:700; color:#E6007E; text-decoration:none;">보고서 열기 →</a>
          </td>
        </tr>
      </table>`
    )
    .join('')

  return `
  <tr>
    <td style="padding:30px 44px 6px;">
      <p style="margin:0; font-size:13px; font-weight:800; letter-spacing:0.06em; color:#1a1a1e; border-left:3px solid #E6007E; padding-left:11px;">📑 함께 보면 좋은 지식보고서</p>
    </td>
  </tr>
  <tr>
    <td style="padding:14px 44px 0;">${cards}
    </td>
  </tr>`
}

export function buildNewsletterHtml(data: NewsletterEmailData): string {
  const totalCardCount = data.newsGroups.reduce((sum, g) => sum + g.cards.length, 0)
  const greeting = data.greetingName
    ? `${escapeHtml(data.greetingName)} 님, 오늘 통신·B2B 시장에서 <strong style="color:#111827;">꼭 짚어야 할 ${totalCardCount}가지</strong>를 추려 담았습니다.`
    : `오늘 통신·B2B 시장에서 <strong style="color:#111827;">꼭 짚어야 할 ${totalCardCount}가지</strong>를 추려 담았습니다.`

  return `
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Insight Out 뉴스레터</title>
<style>
  :root { color-scheme: light only; supported-color-schemes: light only; }
  /* Apple Mail·Outlook·Gmail 다크모드의 강제 색 반전 차단 — 배경은 항상 흰색으로 고정. */
  @media (prefers-color-scheme: dark) {
    body, .io-bg { background-color: #f2f0f2 !important; }
    .io-card { background-color: #ffffff !important; }
    .io-text-body { color: #4a4f57 !important; }
    .io-text-heading { color: #1a1a1e !important; }
    .io-text-muted { color: #6b7280 !important; }
    .io-text-faint { color: #a3a7ae !important; }
  }
  /* Gmail 다크모드 전용 오버라이드 훅. */
  [data-ogsc] body, [data-ogsc] .io-bg, [data-ogsb] .io-bg { background-color: #f2f0f2 !important; }
  [data-ogsc] .io-card, [data-ogsb] .io-card { background-color: #ffffff !important; }
  [data-ogsc] .io-text-body, [data-ogsb] .io-text-body { color: #4a4f57 !important; }
  [data-ogsc] .io-text-heading, [data-ogsb] .io-text-heading { color: #1a1a1e !important; }
</style>
</head>
<body style="margin:0; padding:0; background-color:#f2f0f2; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Apple SD Gothic Neo','Malgun Gothic',sans-serif; -webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="io-bg" style="background-color:#f2f0f2;">
<tr><td align="center" style="padding:20px 12px 56px;">

<table role="presentation" width="640" cellpadding="0" cellspacing="0" class="io-card" style="width:640px; max-width:640px; background:#ffffff; border-radius:18px; overflow:hidden; box-shadow:0 2px 10px rgba(16,24,40,0.06);">

  <tr>
    <td style="padding:34px 44px 22px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td class="io-text-heading" style="font-size:18px; font-weight:800; letter-spacing:0.16em; color:#1a1a1e;">INSIGHT&nbsp;OUT</td>
          <td align="right" class="io-text-faint" style="font-size:12px; color:#a3a7ae; letter-spacing:0.02em;">${escapeHtml(data.dateLabel)} · No.${data.issueNo}</td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:0 44px;">
      <div style="height:2px; background:linear-gradient(to right,#E6007E,#f7b6d8); border-radius:2px;"></div>
    </td>
  </tr>

  <tr>
    <td style="padding:26px 44px 4px;">
      <p class="io-text-body" style="margin:0; font-size:14.5px; line-height:1.8; color:#4a4f57;">
        ${greeting}
        ${data.topTeaser ? `아래 <strong style="color:#E6007E;">${data.topTeaser.type === 'flow' ? '이번 주 핵심 흐름' : '주간 핵심 인사이트'}</strong>부터 확인해 보세요.` : ''}
      </p>
    </td>
  </tr>
${buildTopTeaserSection(data.topTeaser)}
${buildNewsCardsSection(data.newsGroups)}
${buildKnowledgeReportsSection(data.knowledgeReports)}

  <tr>
    <td style="padding:26px 44px 34px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #f4f4f6;">
        <tr>
          <td style="padding-top:22px; text-align:center;">
            <p style="margin:0 0 5px; font-size:12px; font-weight:800; letter-spacing:0.12em; color:#1a1a1e;">INSIGHT OUT</p>
            <p style="margin:0 0 12px; font-size:11px; color:#a3a7ae; line-height:1.7;">이 메일은 Insight Out에서 발송되었습니다.<br>통신·B2B 인사이트를 정리해 드립니다.</p>
            <a href="${data.unsubscribeUrl}" style="font-size:11px; color:#a3a7ae; text-decoration:underline;">수신 거부</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>
  `.trim()
}
