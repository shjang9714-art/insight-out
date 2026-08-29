/**
 * PostgREST `.in()` 필터는 값 목록을 쿼리스트링에 그대로 싣는다 — content_id(uuid) 400개
 * 안팎부터 요청 헤더가 16KB를 넘어 서버가 요청 자체를 거부한다(HeadersOverflowError, 응답조차
 * 못 받고 실패). windowDays=1(하루)일 때는 후보 수가 적어 드러나지 않다가, 주간 전환(7일)으로
 * ids 가 수백~천 단위로 늘면서 발현됨 — 자사·통신사 동향(entity 매칭) 버킷이 통째로 비는 형태로
 * 나타났다(에러가 아니라 조용한 빈 결과라 발견이 늦음). id 목록이 큰 in() 필터는 반드시 청크로 나눈다.
 *
 * 청크 크기 150 — content_entities 는 콘텐츠당 평균 3.74행(2026-08-28 백필 후)이라
 * 150 × 3.74 ≈ 561 로 PostgREST max-rows(1000) 에 여유를 둔다.
 */
export const IN_FILTER_CHUNK_SIZE = 150

export async function fetchInChunks<Row>(
  ids: string[],
  runQuery: (chunk: string[]) => PromiseLike<{
    data: Row[] | null
    error?: { message: string } | null
  }>
): Promise<{ rows: Row[]; error: string | null }> {
  const rows: Row[] = []
  for (let i = 0; i < ids.length; i += IN_FILTER_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + IN_FILTER_CHUNK_SIZE)
    const { data, error } = await runQuery(chunk)
    if (error) return { rows, error: error.message }
    if (data) rows.push(...data)
  }
  return { rows, error: null }
}
