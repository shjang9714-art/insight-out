interface Props {
  title: string
  description: string
}

/**
 * 각 화면의 제목과 설명을 본문 맨 위에 표시하는 공통 페이지 헤더.
 */
export default function PageHeader({ title, description }: Props) {
  return (
    <div className="mb-6 text-left">
      <h1 className="text-xl font-semibold text-foreground sm:text-2xl">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
