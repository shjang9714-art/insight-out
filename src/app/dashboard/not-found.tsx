import ContentPreparing from '@/components/ContentPreparing'

/** notFound() 호출 시(콘텐츠 없음·미발행) 기본 404 대신 브랜드 준비중 화면. */
export default function DashboardNotFound() {
  return <ContentPreparing variant="not-found" />
}
