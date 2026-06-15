// KA(Key Account) 동향 섹션 — 데이터 연동 전 빈 상태 컴포넌트

export default function KATrends() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-sm font-semibold text-foreground">KA 동향</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
          준비 중
        </span>
      </div>

      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          주요 고객사 동향 데이터 연동 후 표시됩니다.
        </p>
      </div>
    </div>
  )
}
