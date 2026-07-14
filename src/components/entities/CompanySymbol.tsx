/**
 * 기업 이니셜 심볼 — 로고 대신 중립 회색 뱃지(343).
 * 브랜드 로고 색을 그대로 쓰면 화면이 다시 복잡해지므로 회색으로 통일한다.
 * 영문 시작(SK텔레콤, LG CNS): 앞 알파벳 최대 2자. 한글 시작(삼성SDS, 네이버클라우드): 첫 글자 1자.
 */
export function initialSymbol(company: string): string {
  const latin = company.match(/^[A-Za-z]{1,2}/)
  if (latin) return latin[0].toUpperCase()
  return company.trim().charAt(0)
}

/** 이니셜이 회사명 전체와 같으면(예: "KT") 같은 글자가 두 번 나오므로 심볼을 생략한다 */
export default function CompanySymbol({ company }: { company: string }) {
  const symbol = initialSymbol(company)
  if (symbol.toLowerCase() === company.trim().toLowerCase()) return null
  return (
    <span
      aria-hidden
      className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-[11px] font-bold tracking-tight text-muted-foreground"
    >
      {symbol}
    </span>
  )
}
