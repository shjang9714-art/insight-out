/**
 * PostgREST max-rows와 큰 `.in()` 요청의 헤더 한계를 피하도록 ID 목록을 나눠 조회한다.
 */
export const IN_FILTER_CHUNK_SIZE = 150

export async function fetchInChunks<Row>(
  ids: string[],
  runQuery: (chunk: string[]) => PromiseLike<{ data: Row[] | null }>
): Promise<Row[]> {
  const results: Row[] = []
  for (let i = 0; i < ids.length; i += IN_FILTER_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + IN_FILTER_CHUNK_SIZE)
    const { data } = await runQuery(chunk)
    if (data) results.push(...data)
  }
  return results
}
