interface Props {
  title: string
  description: string
}

/**
 * 5개 탭(핵심 인사이트·키워드 분석·기업동향·관계지도·자료실) 공통 페이지 헤더.
 * 내비 바로 아래, 페이지 최상단 첫 요소로 둔다.
 */
export default function PageHeader({ title, description }: Props) {
  return (
    <div className="mb-6 text-left">
      <h1 className="text-xl font-semibold text-foreground sm:text-2xl">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
