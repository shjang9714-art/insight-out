/**
 * LLM provider HTTP 상태코드 판정 — openai-compat · gemini 공용.
 * 판정 로직을 provider별로 각각 만들지 않는다. 갈라지면 provider마다 다르게 동작한다.
 */
export interface HttpClassification {
  /** 같은 모델로 다시 불러도 결과가 같다 — 키 재시도·쿨다운 없이 즉시 종료 */
  permanent: boolean
  /** 재시도 가치 있음 — 상위가 쿨다운을 건다 */
  retryable: boolean
  /** retryable 일 때만 의미. 'rate'=30초, 'auth'=3분 */
  kind?: 'rate' | 'auth'
}

export function classifyHttpStatus(
  status: number,
  opts: { treat400AsAuth?: boolean } = {}
): HttpClassification {
  if (status === 400) {
    // Google Generative Language API는 잘못된 키에도 400(API_KEY_INVALID)을 돌려주는 사례가 있다.
    // 확신할 수 없으므로 permanent로 잡지 않고 보수적으로 auth 쿨다운으로 보낸다.
    if (opts.treat400AsAuth) return { permanent: false, retryable: true, kind: 'auth' }
    return { permanent: true, retryable: false }
  }
  if (status === 404 || status === 422) return { permanent: true, retryable: false }
  if (status === 401 || status === 402 || status === 403) {
    return { permanent: false, retryable: true, kind: 'auth' }
  }
  if (status === 408 || status === 429 || (status >= 500 && status <= 599)) {
    return { permanent: false, retryable: true, kind: 'rate' }
  }
  return { permanent: false, retryable: false }
}
