import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'

const ENUM_MARKS = /[①②③④⑤⑥⑦⑧⑨⑩]/g

/**
 * 카드 렌더 직전 서술문 정제(343) — `stripLlmArtifacts` + `①②③` 열거 기호 제거.
 * 번호는 보고서 본문에는 맞지만 카드 요약에서는 시선을 방해한다.
 * 저장 데이터는 건드리지 않는다(렌더 단계 정제 전용).
 */
export function cleanNarrative(text: string): string {
  return stripLlmArtifacts(text)
    .replace(ENUM_MARKS, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}
