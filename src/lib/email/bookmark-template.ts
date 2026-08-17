import type { ContentCategory } from '@/lib/types'

export interface BookmarkEmailItem {
  title: string
  category: ContentCategory | string
  sourceName: string | null
  publishedAt: string | null
  summaryKo: string | null
  originalUrl: string | null
  reportSignedUrl: string | null
  isAttached?: boolean
}

export interface BookmarkEmailData {
  recipientName: string
  items: BookmarkEmailItem[]
}

export function buildBookmarkEmailHtml(data: BookmarkEmailData): string {
  const itemsHtml = data.items
    .map((item, i) => {
      let linkHtml = ''
      if (item.isAttached) {
        linkHtml = '<p style="margin: 4px 0 0; font-size: 13px; color: #6b7280;">📎 PDF 파일이 첨부되어 있습니다</p>'
      } else if (item.reportSignedUrl) {
        linkHtml = `<p style="margin: 4px 0 0;"><a href="${item.reportSignedUrl}" style="font-size: 13px; color: #E6007E; text-decoration: none;">PDF 다운로드 →</a></p>`
      } else if (item.originalUrl) {
        linkHtml = `<p style="margin: 4px 0 0;"><a href="${item.originalUrl}" style="font-size: 13px; color: #E6007E; word-break: break-all;">${item.originalUrl}</a></p>`
      }

      return `
      <tr>
        <td style="padding: 16px; border-bottom: 1px solid #f3f4f6;">
          <p style="margin: 0 0 4px; font-size: 13px; color: #6b7280;">${i + 1}. ${item.category}${item.sourceName ? ` · ${item.sourceName}` : ''}${item.publishedAt ? ` · ${new Date(item.publishedAt).toLocaleDateString('ko-KR')}` : ''}</p>
          <p style="margin: 0 0 6px; font-size: 16px; font-weight: 600; color: #111827; line-height: 1.4;">${item.title}</p>
          ${item.summaryKo ? `<p style="margin: 0 0 8px; font-size: 14px; color: #374151; line-height: 1.6;">${item.summaryKo}</p>` : ''}
          ${linkHtml}
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
    <!-- 헤더 -->
    <tr>
      <td style="padding: 24px 24px 16px; background-color: #E6007E;">
        <p style="margin: 0; font-size: 12px; color: rgba(255,255,255,0.7); letter-spacing: 0.05em;">INSIGHT OUT</p>
        <h1 style="margin: 4px 0 0; font-size: 20px; color: #ffffff;">내 북마크</h1>
      </td>
    </tr>
    <!-- 안내 문구 -->
    <tr>
      <td style="padding: 16px 24px; border-bottom: 1px solid #f3f4f6; background: #fdf2f8;">
        <p style="margin: 0; font-size: 13px; color: #6b7280;">
          ${data.recipientName} 님이 담아둔 인사이트 ${data.items.length}건을 전달드립니다.
        </p>
      </td>
    </tr>
    <!-- 콘텐츠 목록 -->
    <table width="100%" cellpadding="0" cellspacing="0">
      ${itemsHtml}
    </table>
    <!-- 푸터 -->
    <tr>
      <td style="padding: 20px 24px; border-top: 1px solid #f3f4f6; text-align: center;">
        <p style="margin: 0; font-size: 12px; color: #9ca3af;">
          이 메일은 Insight Out에서 발송되었습니다.<br>
          <a href="https://insight-out-app.vercel.app/dashboard/mypage" style="color: #9ca3af;">수신 설정 변경</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}
