/** 코드펜스/잡담 섞인 LLM 출력에서 JSON 객체를 관용적으로 추출. */
export function looseJsonParse(raw: string): unknown | null {
  const s = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()

  try {
    return JSON.parse(s)
  } catch { /* continue */ }

  const m = s.match(/\{[\s\S]*\}/)
  if (m) {
    try {
      return JSON.parse(m[0])
    } catch { /* continue */ }
  }

  return null
}
