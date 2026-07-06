/**
 * 208 — /admin(대시보드) 로딩 경계. force-dynamic + ~21개 집계 쿼리로 준비 완료까지
 * 시간이 걸려, 로딩 경계가 없으면 이전 화면에 멈춰 있는 것처럼 보인다(Next.js 기본 동작).
 * 실제 데이터·쿼리와 무관한 중립 스켈레톤 — 대략적인 골격만 맞춘다.
 */
export default function AdminLoading() {
  return (
    <div className="animate-pulse space-y-10">
      {/* 페이지 헤더 자리 */}
      <div className="space-y-2">
        <div className="h-7 w-40 rounded-md bg-muted" />
        <div className="h-4 w-72 rounded-md bg-muted" />
      </div>

      {/* 오늘 할 일 / 운영 신호등 / 콘텐츠 건강 자리 */}
      <div className="h-36 rounded-2xl border border-border bg-card" />
      <div className="h-44 rounded-2xl border border-border bg-card" />
      <div className="h-36 rounded-2xl border border-border bg-card" />

      {/* KPI 카드 그리드 자리 */}
      <div className="space-y-4">
        <div className="h-5 w-24 rounded-md bg-muted" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-36 rounded-2xl border border-border bg-card" />
          ))}
        </div>
      </div>

      {/* 차트 블록 자리 */}
      <div className="space-y-4">
        <div className="h-5 w-24 rounded-md bg-muted" />
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="h-72 rounded-2xl border border-border bg-card" />
          <div className="h-72 rounded-2xl border border-border bg-card" />
        </div>
      </div>
    </div>
  )
}
