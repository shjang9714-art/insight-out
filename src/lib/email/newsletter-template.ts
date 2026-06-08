export interface NewsletterCard {
  title: string
  category: string
  sourceName: string | null
  summaryKo: string | null
  url: string | null
}

export interface NewsletterEmailData {
  dateLabel: string
  cards: NewsletterCard[]
  unsubscribeUrl: string
}

export function buildNewsletterHtml(data: NewsletterEmailData): string {
  const cardsHtml = data.cards
    .map((card, i) => {
      return `
      <tr>
        <td style="padding: 16px; border-bottom: 1px solid #f3f4f6;">
          <p style="margin: 0 0 4px; font-size: 13px; color: #6b7280;">${i + 1}. ${card.category}${card.sourceName ? ` · ${card.sourceName}` : ''}</p>
          <p style="margin: 0 0 6px; font-size: 16px; font-weight: 600; color: #111827; line-height: 1.4;">${card.title}</p>
          ${card.summaryKo ? `<p style="margin: 0 0 8px; font-size: 14px; color: #374151; line-height: 1.6;">${card.summaryKo}</p>` : ''}
          ${card.url ? `<a href="${card.url}" style="font-size: 13px; color: #E6007E; text-decoration: none;">자세히 보기 →</a>` : ''}
        </td>
      </tr>
    `
    })
    .join('')

  return `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 32px auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
    <tr>
      <td style="padding: 24px 24px 16px; background-color: #E6007E;">
        <p style="margin: 0; font-size: 12px; color: rgba(255,255,255,0.7); letter-spacing: 0.05em;">INSIGHT OUT</p>
        <h1 style="margin: 4px 0 0; font-size: 20px; color: #ffffff;">오늘의 B2B 인사이트</h1>
      </td>
    </tr>
    <tr>
      <td style="padding: 12px 24px; border-bottom: 1px solid #f3f4f6; background: #fdf2f8;">
        <p style="margin: 0; font-size: 13px; color: #6b7280;">${data.dateLabel} · 인사이트 ${data.cards.length}건</p>
      </td>
    </tr>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${cardsHtml}
    </table>
    <tr>
      <td style="padding: 20px 24px; border-top: 1px solid #f3f4f6; text-align: center;">
        <p style="margin: 0; font-size: 12px; color: #9ca3af;">
          이 메일은 Insight Out에서 발송되었습니다.<br>
          수신을 원치 않으시면 <a href="${data.unsubscribeUrl}" style="color: #9ca3af;">구독 해지</a>를 클릭하세요.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}
