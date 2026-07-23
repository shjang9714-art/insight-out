export interface NewsletterCard {
  title: string
  category: string
  sourceName: string | null
  summaryKo: string | null
  detailUrl: string
  originalUrl: string | null
  insight: string | null
}

export interface NewsletterDailyInsight {
  headline: string
  summaryKo: string
  detailUrl: string
}

export interface NewsletterKnowledgeReport {
  category: string
  title: string
  teaser: string
  detailUrl: string
}

export interface NewsletterCompanyTrend {
  company: string
  trend: string
  isLgu: boolean
}

export interface NewsletterEmailData {
  dateLabel: string
  issueNo: number
  greetingName: string | null
  cards: NewsletterCard[]
  dailyInsight: NewsletterDailyInsight | null
  knowledgeReports: NewsletterKnowledgeReport[]
  companyTrends: NewsletterCompanyTrend[]
  unsubscribeUrl: string
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function buildDailyInsightSection(data: NewsletterEmailData['dailyInsight']): string {
  if (!data) return ''
  return `
  <tr>
    <td style="padding:20px 40px 8px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fdf2f8; border-radius:12px;">
        <tr>
          <td style="padding:22px 24px;">
            <p style="margin:0 0 10px; font-size:11px; font-weight:700; letter-spacing:0.12em; color:#E6007E;">오늘의 핵심 인사이트</p>
            <p style="margin:0 0 10px; font-size:19px; font-weight:800; line-height:1.4; color:#111827;">${escapeHtml(data.headline)}</p>
            <p style="margin:0 0 16px; font-size:14px; line-height:1.7; color:#4b5563;">${escapeHtml(data.summaryKo)}</p>
            <a href="${data.detailUrl}" style="display:inline-block; font-size:13px; font-weight:700; color:#ffffff; background:#E6007E; padding:10px 18px; border-radius:8px; text-decoration:none;">인사이트 전문 보기 →</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>`
}

function buildNewsCardsSection(cards: NewsletterCard[]): string {
  if (cards.length === 0) return ''

  const items = cards
    .map((card, i) => {
      const isLast = i === cards.length - 1
      return `
  <tr>
    <td style="padding:14px 40px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" ${isLast ? '' : 'style="border-bottom:1px solid #f1f2f4;"'}>
        <tr>
          <td width="34" valign="top" style="padding:0 0 18px;">
            <span style="display:inline-block; width:24px; height:24px; line-height:24px; text-align:center; font-size:12px; font-weight:700; color:#E6007E; background:#fce7f0; border-radius:6px;">${i + 1}</span>
          </td>
          <td valign="top" style="padding:0 0 18px;">
            <p style="margin:0 0 5px; font-size:11px; color:#9ca3af;"><span style="color:#E6007E; font-weight:700;">${escapeHtml(card.category)}</span>${card.sourceName ? ` · ${escapeHtml(card.sourceName)}` : ''}</p>
            <p style="margin:0 0 6px; font-size:15px; font-weight:700; line-height:1.45; color:#111827;">${escapeHtml(card.title)}</p>
            ${card.summaryKo ? `<p style="margin:0 0 8px; font-size:13px; line-height:1.65; color:#6b7280;">${escapeHtml(card.summaryKo)}</p>` : ''}
            ${card.insight ? `<p style="margin:0 0 8px; font-size:12.5px; line-height:1.6; color:#4b5563; border-top:1px dashed #eef0f3; padding-top:8px;"><span style="color:#E6007E; font-weight:700;">인사이트 ·</span> ${escapeHtml(card.insight)}</p>` : ''}
            <a href="${card.detailUrl}" style="font-size:12px; font-weight:700; color:#E6007E; text-decoration:none;">자세히 보기 →</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>`
    })
    .join('')

  return `
  <tr>
    <td style="padding:28px 40px 6px;">
      <p style="margin:0; font-size:13px; font-weight:800; letter-spacing:0.06em; color:#111827; border-left:4px solid #E6007E; padding-left:10px;">오늘의 주요 뉴스</p>
    </td>
  </tr>${items}`
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
      <p style="margin:0; font-size:13px; font-weight:800; letter-spacing:0.06em; color:#111827; border-left:4px solid #E6007E; padding-left:10px;">함께 보면 좋은 지식보고서</p>
    </td>
  </tr>
  <tr>
    <td style="padding:14px 40px 0;">${cards}
    </td>
  </tr>`
}

function buildCompanyTrendsSection(trends: NewsletterCompanyTrend[]): string {
  if (trends.length === 0) return ''

  const rows = trends
    .map(
      (t, i) => `
        <tr><td style="padding:7px 0; ${i < trends.length - 1 ? 'border-bottom:1px solid #f5f6f7;' : ''} font-size:13px; color:#374151; line-height:1.6;"><strong style="color:${t.isLgu ? '#E6007E' : '#111827'};">${escapeHtml(t.company)}</strong> · ${escapeHtml(t.trend)}</td></tr>`
    )
    .join('')

  return `
  <tr>
    <td style="padding:30px 40px 6px;">
      <p style="margin:0; font-size:13px; font-weight:800; letter-spacing:0.06em; color:#111827; border-left:4px solid #E6007E; padding-left:10px;">기업 동향 브리핑</p>
    </td>
  </tr>
  <tr>
    <td style="padding:12px 40px 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}
      </table>
    </td>
  </tr>`
}

export function buildNewsletterHtml(data: NewsletterEmailData): string {
  const greeting = data.greetingName
    ? `${escapeHtml(data.greetingName)} 님, 오늘 통신·B2B 시장에서 <strong style="color:#111827;">꼭 짚어야 할 ${data.cards.length}가지</strong>를 추려 담았습니다.`
    : `오늘 통신·B2B 시장에서 <strong style="color:#111827;">꼭 짚어야 할 ${data.cards.length}가지</strong>를 추려 담았습니다.`

  return `
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Insight Out 뉴스레터</title>
</head>
<body style="margin:0; padding:0; background-color:#eceef1; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Apple SD Gothic Neo','Malgun Gothic',sans-serif; -webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eceef1;">
<tr><td align="center" style="padding:16px 12px 40px;">

<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px; max-width:600px; background:#ffffff; border-radius:14px; overflow:hidden; box-shadow:0 1px 3px rgba(16,24,40,0.08);">

  <tr>
    <td style="padding:32px 40px 24px; border-bottom:3px solid #E6007E;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:18px; font-weight:800; letter-spacing:0.14em; color:#111827;">INSIGHT&nbsp;OUT</td>
          <td align="right" style="font-size:12px; color:#9ca3af; letter-spacing:0.02em;">${escapeHtml(data.dateLabel)} · No.${data.issueNo}</td>
        </tr>
      </table>
    </td>
  </tr>

  <tr>
    <td style="padding:28px 40px 8px;">
      <p style="margin:0; font-size:14px; line-height:1.7; color:#374151;">
        ${greeting}
        ${data.dailyInsight ? `아래 <strong style="color:#E6007E;">오늘의 핵심 인사이트</strong>부터 확인해 보세요.` : ''}
      </p>
    </td>
  </tr>
${buildDailyInsightSection(data.dailyInsight)}
${buildNewsCardsSection(data.cards)}
${buildKnowledgeReportsSection(data.knowledgeReports)}
${buildCompanyTrendsSection(data.companyTrends)}

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
