import type { NewsGroupKey } from '@/lib/newsletter/news-groups'

export interface NewsletterCard {
  title: string
  category: string
  sourceName: string | null
  summaryKo: string | null
  detailUrl: string
  originalUrl: string | null
  insight: string | null
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
    <td style="padding:20px 40px 8px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fdf2f8; border-radius:12px;">
        <tr>
          <td style="padding:22px 24px;">
            <p style="margin:0 0 10px; font-size:11px; font-weight:700; letter-spacing:0.12em; color:#E6007E;">🧭 주간 핵심 인사이트</p>
            <p style="margin:0 0 10px; font-size:19px; font-weight:800; line-height:1.4; color:#111827;">${escapeHtml(data.headline)}</p>
            <p style="margin:0 0 16px; font-size:14px; line-height:1.7; color:#4b5563;">💡 ${escapeHtml(data.summaryKo)}</p>
            <a href="${data.detailUrl}" style="display:inline-block; font-size:13px; font-weight:700; color:#ffffff; background:#E6007E; padding:10px 18px; border-radius:8px; text-decoration:none;">인사이트 전문 보기 →</a>
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
    <td style="padding:20px 40px 8px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fdf2f8; border-radius:12px;">
        <tr>
          <td style="padding:22px 24px;">
            <p style="margin:0 0 10px; font-size:11px; font-weight:700; letter-spacing:0.12em; color:#E6007E;">🧭 이번 주 핵심 흐름</p>
            ${data.headline ? `<p style="margin:0 0 14px; font-size:19px; font-weight:800; line-height:1.4; color:#111827;">${escapeHtml(data.headline)}</p>` : ''}
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

function buildNewsCardItem(card: NewsletterCard, i: number, isLast: boolean): string {
  return `
  <tr>
    <td style="padding:14px 0 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" ${isLast ? '' : 'style="border-bottom:1px solid #f1f2f4;"'}>
        <tr>
          <td width="34" valign="top" style="padding:0 0 18px;">
            <span style="display:inline-block; width:24px; height:24px; line-height:24px; text-align:center; font-size:12px; font-weight:700; color:#E6007E; background:#fce7f0; border-radius:6px;">${i + 1}</span>
          </td>
          <td valign="top" style="padding:0 0 18px;">
            <p style="margin:0 0 5px; font-size:11px; color:#9ca3af;"><span style="color:#E6007E; font-weight:700;">${escapeHtml(card.category)}</span>${card.sourceName ? ` · ${escapeHtml(card.sourceName)}` : ''}</p>
            <p style="margin:0 0 6px; font-size:15px; font-weight:700; line-height:1.45; color:#111827;">${escapeHtml(card.title)}</p>
            ${card.summaryKo ? `<p style="margin:0 0 8px; font-size:13px; line-height:1.65; color:#6b7280;">${escapeHtml(card.summaryKo)}</p>` : ''}
            ${card.insight ? `<p style="margin:0 0 8px; font-size:12.5px; line-height:1.6; color:#4b5563; border-top:1px dashed #eef0f3; padding-top:8px;">💡 <span style="color:#E6007E; font-weight:700;">인사이트 ·</span> ${escapeHtml(card.insight)}</p>` : ''}
            <a href="${card.detailUrl}" style="font-size:12px; font-weight:700; color:#E6007E; text-decoration:none;">자세히 보기 →</a>
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
    <td style="padding:20px 0 4px;">
      <p style="margin:0; font-size:12.5px; font-weight:700; color:#111827;">${escapeHtml(group.label)}</p>
    </td>
  </tr>${body}`
}

function buildNewsCardsSection(groups: NewsletterNewsGroup[]): string {
  if (groups.length === 0) return ''

  const blocks = groups.map(buildNewsGroupBlock).join('')

  return `
  <tr>
    <td style="padding:28px 40px 0;">
      <p style="margin:0 0 4px; font-size:13px; font-weight:800; letter-spacing:0.06em; color:#111827; border-left:4px solid #E6007E; padding-left:10px;">📌 오늘의 주요 뉴스</p>
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
    <td style="padding:30px 40px 6px;">
      <p style="margin:0; font-size:13px; font-weight:800; letter-spacing:0.06em; color:#111827; border-left:4px solid #E6007E; padding-left:10px;">📑 함께 보면 좋은 지식보고서</p>
    </td>
  </tr>
  <tr>
    <td style="padding:14px 40px 0;">${cards}
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
    body, .io-bg { background-color: #eceef1 !important; }
    .io-card { background-color: #ffffff !important; }
    .io-text-body { color: #374151 !important; }
    .io-text-heading { color: #111827 !important; }
    .io-text-muted { color: #6b7280 !important; }
    .io-text-faint { color: #9ca3af !important; }
  }
  /* Gmail 다크모드 전용 오버라이드 훅. */
  [data-ogsc] body, [data-ogsc] .io-bg, [data-ogsb] .io-bg { background-color: #eceef1 !important; }
  [data-ogsc] .io-card, [data-ogsb] .io-card { background-color: #ffffff !important; }
  [data-ogsc] .io-text-body, [data-ogsb] .io-text-body { color: #374151 !important; }
  [data-ogsc] .io-text-heading, [data-ogsb] .io-text-heading { color: #111827 !important; }
</style>
</head>
<body style="margin:0; padding:0; background-color:#eceef1; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Apple SD Gothic Neo','Malgun Gothic',sans-serif; -webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="io-bg" style="background-color:#eceef1;">
<tr><td align="center" style="padding:16px 12px 40px;">

<table role="presentation" width="600" cellpadding="0" cellspacing="0" class="io-card" style="width:600px; max-width:600px; background:#ffffff; border-radius:14px; overflow:hidden; box-shadow:0 1px 3px rgba(16,24,40,0.08);">

  <tr>
    <td style="padding:32px 40px 24px; border-bottom:3px solid #E6007E;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td class="io-text-heading" style="font-size:18px; font-weight:800; letter-spacing:0.14em; color:#111827;">INSIGHT&nbsp;OUT</td>
          <td align="right" class="io-text-faint" style="font-size:12px; color:#9ca3af; letter-spacing:0.02em;">${escapeHtml(data.dateLabel)} · No.${data.issueNo}</td>
        </tr>
      </table>
    </td>
  </tr>

  <tr>
    <td style="padding:28px 40px 8px;">
      <p class="io-text-body" style="margin:0; font-size:14px; line-height:1.7; color:#374151;">
        ${greeting}
        ${data.topTeaser ? `아래 <strong style="color:#E6007E;">${data.topTeaser.type === 'flow' ? '이번 주 핵심 흐름' : '주간 핵심 인사이트'}</strong>부터 확인해 보세요.` : ''}
      </p>
    </td>
  </tr>
${buildTopTeaserSection(data.topTeaser)}
${buildNewsCardsSection(data.newsGroups)}
${buildKnowledgeReportsSection(data.knowledgeReports)}

  <tr>
    <td style="padding:28px 40px 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eef0f3;">
        <tr>
          <td style="padding-top:20px; text-align:center;">
            <p style="margin:0 0 4px; font-size:12px; font-weight:800; letter-spacing:0.1em; color:#111827;">INSIGHT OUT</p>
            <p style="margin:0 0 12px; font-size:11px; color:#9ca3af; line-height:1.6;">이 메일은 Insight Out에서 발송되었습니다.<br>통신·B2B 인사이트를 정리해 드립니다.</p>
            <a href="${data.unsubscribeUrl}" style="font-size:11px; color:#9ca3af; text-decoration:underline;">수신 거부</a>
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
