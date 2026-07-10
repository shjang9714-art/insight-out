import Link from 'next/link'
import { Hourglass } from 'lucide-react'

interface Props {
  /** not-found: 요청한 콘텐츠가 없음. error: 일시적 오류. */
  variant?: 'not-found' | 'error'
  /** error 화면의 "다시 시도" 등 추가 액션 슬롯(클라이언트 버튼 주입용). */
  action?: React.ReactNode
}

/**
 * 404/500 대신 노출하는 브랜드 "콘텐츠 준비중" 빈 상태 화면.
 * 대시보드 레이아웃(헤더·네비) 안에서 렌더되어 신뢰도를 유지한다.
 * 훅 없는 서버 안전 컴포넌트 — not-found.tsx(서버)·error.tsx(클라이언트) 양쪽에서 재사용.
 */
export default function ContentPreparing({ variant = 'not-found', action }: Props) {
  const sub =
    variant === 'error'
      ? '일시적인 문제로 화면을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'
      : '요청하신 콘텐츠를 준비하고 있습니다. 정리되는 대로 곧 확인하실 수 있습니다.'

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 dark:bg-brand-950/30">
        <Hourglass className="h-7 w-7 text-brand-600" />
      </div>
      <h1 className="mb-2 text-lg font-bold text-foreground">콘텐츠 준비중</h1>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{sub}</p>
      <div className="mt-6 flex items-center gap-2">
        {action}
        <Link
          href="/dashboard"
          className="inline-flex items-center rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-brand-600 hover:text-brand-600"
        >
          홈으로 돌아가기
        </Link>
      </div>
    </div>
  )
}
