// KA(Key Account) 동향 섹션 — 실제 데이터 연동 전 셸 컴포넌트

const PLACEHOLDER_ITEMS = [
  { id: '1', company: 'KA 고객사 A', summary: '데이터 연동 후 실제 동향이 표시됩니다.', date: '' },
  { id: '2', company: 'KA 고객사 B', summary: '주요 고객사의 최신 동향을 모니터링합니다.', date: '' },
  { id: '3', company: 'KA 고객사 C', summary: '사업 관련 뉴스 및 공시 정보를 자동 수집합니다.', date: '' },
]

export default function KATrends() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-base">🏢</span>
        <h2 className="text-sm font-semibold text-foreground">KA 동향</h2>
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
          준비 중
        </span>
      </div>

      <div className="space-y-3">
        {PLACEHOLDER_ITEMS.map((item) => (
          <div key={item.id} className="flex gap-3 rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-bold text-muted-foreground">
              {item.company.slice(-1)}
            </div>
            <div>
              <p className="text-xs font-medium text-foreground">{item.company}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{item.summary}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
