import { cn } from '@/lib/utils'

interface Props {
  children: React.ReactNode
  /** list: 대시보드형 목록 화면(기본). reading: 상세/본문 위주 화면(가독성 폭 제한) */
  variant?: 'list' | 'reading'
  className?: string
}

/**
 * 대시보드 탭 전반의 컨테이너 폭·좌우 패딩을 통일하는 공용 래퍼.
 * list 는 layout.tsx 의 <main max-w-screen-xl> 폭을 그대로 쓰고,
 * reading 은 그 안에서 본문 가독성을 위해 폭을 한 번 더 좁힌다.
 * reading 은 mx-auto(중앙 정렬) 없이 좌측 정렬 — list 와 좌측 패딩(px-4 sm:px-5)을
 * 동일하게 맞춰 목록→상세 진입 시 본문 좌측 시작선이 그대로 유지되게 한다.
 */
export default function PageContainer({ children, variant = 'list', className }: Props) {
  return (
    <div
      className={cn(
        variant === 'list'
          ? 'px-4 py-6 sm:px-5'
          : 'max-w-3xl px-4 py-8 sm:px-5',
        className,
      )}
    >
      {children}
    </div>
  )
}
