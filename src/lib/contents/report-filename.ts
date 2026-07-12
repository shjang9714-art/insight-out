/**
 * 리포트 다운로드 파일명 생성(307) — "{제목}_{발행기관}.확장자" 형태.
 * 경로 구분자 등 파일명에 쓸 수 없는 문자만 정리하고 한글은 그대로 둔다.
 */
export function buildReportDownloadName(
  title: string,
  orgName: string | null,
  filePath: string,
): string {
  const extMatch = filePath.match(/\.[a-zA-Z0-9]+$/)
  const ext = extMatch ? extMatch[0] : '.pdf'

  const sanitize = (s: string) => s.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim()

  const parts = [sanitize(title), orgName ? sanitize(orgName) : null].filter(Boolean)
  return `${parts.join('_')}${ext}`
}
