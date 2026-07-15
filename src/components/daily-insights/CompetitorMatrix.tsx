import type { CompetitorMatrixEntry } from '@/lib/daily-insights/types'

interface CompetitorMatrixProps {
  matrix: CompetitorMatrixEntry[]
}

/**
 * §2.5① 경쟁 구도 매트릭스 — 근거 기사에 실제 등장한 사업자만(generate.ts verifyCompetitorMatrix
 * 가 이미 검증). 근거 부족 칸은 "—"로 표시(창작 없음). 상세 전용 — 카드에는 넣지 않는다.
 */
export default function CompetitorMatrix({ matrix }: CompetitorMatrixProps) {
  if (matrix.length === 0) return null

  return (
    <section className="space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">🧭 경쟁 구도</p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2">사업자</th>
              <th className="px-3 py-2">이번 움직임</th>
              <th className="px-3 py-2">강점·차별점</th>
              <th className="px-3 py-2">리스크·공백</th>
            </tr>
          </thead>
          <tbody>
            {matrix.map((row) => (
              <tr key={row.company} className="border-b border-border/60 last:border-0 align-top">
                <td className="whitespace-nowrap px-3 py-2 font-semibold text-foreground">{row.company}</td>
                <td className="px-3 py-2 text-foreground/90">{row.move}</td>
                <td className="px-3 py-2 text-foreground/90">{row.edge}</td>
                <td className="px-3 py-2 text-muted-foreground">{row.risk}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
