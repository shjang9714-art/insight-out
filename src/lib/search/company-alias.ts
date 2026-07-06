// 회사·브랜드 별칭 → 기사 본문에서 실제 쓰이는 표기(주로 한글 정식명).
// 워치리스트에 영문 슬러그(예: 'lguplus')로 저장되면 한글 기사에 ilike로 안 걸리는
// 문제를 보정한다. 서버(RAG)·클라이언트(검색 페이지) 양쪽에서 공용으로 사용.
// 키는 소문자.

export const COMPANY_ALIASES: Record<string, string> = {
  lguplus: 'LG유플러스', 'lgu+': 'LG유플러스', lgu: 'LG유플러스', uplus: 'LG유플러스',
  'lg유플러스': 'LG유플러스', 엘지유플러스: 'LG유플러스',
  skt: 'SK텔레콤', 'sk텔레콤': 'SK텔레콤', 에스케이텔레콤: 'SK텔레콤',
  skb: 'SK브로드밴드', 'sk브로드밴드': 'SK브로드밴드',
  kt: 'KT', 케이티: 'KT',
  samsung: '삼성전자', 'samsung electronics': '삼성전자',
  hanwha: '한화',
}

// 단일 용어를 정식명으로 정규화. 매핑이 없으면 null.
export function normalizeCompany(term: string): string | null {
  return COMPANY_ALIASES[term.trim().toLowerCase()] ?? null
}
