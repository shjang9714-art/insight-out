const INLINE_ID = /\s*\[[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\]/g

/**
 * 과거 생성된 리포트의 서술문에 LLM이 박아 넣은 [content_id] UUID 마커를 제거한다.
 * 출처는 citations 칩으로 이미 표시되므로 인라인 UUID는 순수 노이즈(283).
 * UUID 형태에만 매칭 — [LG U+] 같은 정상 대괄호 표현은 건드리지 않는다.
 */
export function stripInlineCitations(text: string): string {
  return text.replace(INLINE_ID, '').replace(/\s+([.,·])/g, '$1').replace(/\s{2,}/g, ' ').trim()
}
