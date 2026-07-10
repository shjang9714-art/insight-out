import ContentPreparing from '@/components/ContentPreparing'

/** 대시보드 밖 경로에서 notFound()·미매칭 URL 시 기본 404 대신 준비중 화면. */
export default function RootNotFound() {
  return <ContentPreparing variant="not-found" />
}
