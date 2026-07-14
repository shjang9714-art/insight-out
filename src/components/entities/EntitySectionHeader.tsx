import Link from 'next/link'
import type { ReactNode } from 'react'

interface Props {
  title: string
  /** 한 줄 설명 — 대표 회사명·기간 등으로 조립 */
  subtitle?: string
  /** 우측 메타(건수 등) — 텍스트 */
  meta?: string
  /** 우측 메타 앞에 붙는 보조 요소(위기·기회 배지 등) */
  metaSlot?: ReactNode
  seeAllHref?: string
  seeAllLabel?: string
}

/**
 * 기업동향 공용 섹션 헤더(343·344) — 박스 없는 플랫 헤더.
 * 시각 표면은 카드 1단계뿐. 섹션은 제목과 여백으로만 구분한다.
 * `전체 보기`는 핑크 상시 노출 대신 기본 진회색 + 호버 시 핑크.
 */
export default function EntitySectionHeader({
  title, subtitle, meta, metaSlot, seeAllHref, seeAllLabel = '전체 보기 →',
}: Props) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <div className="min-w-0">
        <h3 className="text-xl font-bold tracking-tight text-foreground">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted-foreground">{subtitle}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-2 text-[13px] text-muted-foreground">
        {metaSlot}
        {meta && <span>{meta}</span>}
        {seeAllHref && (
          <>
            {(meta || metaSlot) && <span aria-hidden className="text-border">·</span>}
            <Link
              href={seeAllHref}
              prefetch={false}
              className="font-medium text-foreground/70 transition-colors hover:text-brand-600"
            >
              {seeAllLabel}
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
