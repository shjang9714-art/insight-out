// 394 — 원래는 정형 UUID 하나만 잡았다. 실측 결과 LLM이 자릿수를 흔들어 적거나(7자리 등)
// 콤마로 여러 개를 나열하는 경우가 있어, hex 그룹을 범위로 두고 콤마+공백 구분 반복을 허용한다.
const UUIDISH_SOURCE = '[0-9a-fA-F]{6,8}(?:-[0-9a-fA-F]{3,4}){3}-[0-9a-fA-F]{10,12}'
const INLINE_UUID_MARKER = new RegExp(
  String.raw`\s*\[\s*${UUIDISH_SOURCE}(?:\s*,\s*${UUIDISH_SOURCE})*\s*\]`, 'g'
)
const RAW_QUOTE_TAG = /<\/?\s*quote(?:\s+[^>]*)?>/gi
const ESCAPED_QUOTE_TAG = /&lt;\/?\s*quote(?:\s+[^&]*?)?&gt;/gi

/**
 * LLM이 서술문에 박아 넣는 산출물 아티팩트 제거(293).
 * 출처는 citations 배열/출처 칩으로 별도 표시되므로, 서술문 안의 태그와 UUID는 노이즈다.
 *
 * citations/content_id를 요구하는 LLM 생성기의 서술 출력은 전부 이 유틸을 거쳐야 한다.
 * 새 생성기를 추가할 때는 저장 전 정제와 렌더 직전 정제를 함께 적용하고, 이 목록도 갱신한다.
 *
 * 현재 적용 대상:
 * - insight/generate.ts: 카드 제목·본문·시사점
 * - daily-insights/generate.ts: 일일 인사이트 요약·시사점
 * - key-insights/generate.ts: 핵심 인사이트 요약·시사점·관련 과거기사 이유
 * - competitor-weekly/generate.ts: 요약·섹션 본문·시사점
 * - reports/generate-strategy.ts: 보고서 요약·HTML·Markdown
 * - issues/brief.ts: 현황·핵심 동인·논조 해석·시사점
 * - issues/generate-candidates.ts: 이슈 제목·요약
 * - briefing/generate-briefing.ts: 브리핑 스크립트
 * - briefing/highlights.ts: 브리핑 핵심 인사이트 키워드·제목·상세
 * - entities/generate-events.ts: 기업 사건 타임라인 제목·상세
 */
export function stripLlmArtifacts(text: string): string {
  const stripped = text
    .replace(RAW_QUOTE_TAG, '')
    .replace(ESCAPED_QUOTE_TAG, '')
    .replace(INLINE_UUID_MARKER, '')

  if (stripped === text) return text

  return stripped
    .replace(/[ \t]+([.,!?;:·，。！？])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .trim()
}
