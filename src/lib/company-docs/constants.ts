import type { CompanyDocumentGroup, CompanyDocumentSourceKind, CompanyDocumentType } from '@/lib/types'

/**
 * 355-C — 기업자료 도메인 공용 상수. discovery(발견 커넥터)·소스 레지스트리·
 * 업로드 통·검토함이 모두 이 파일을 참조해 doc_type/doc_group 매핑을 하나로 유지한다.
 */

export const COMPANY_DOC_TYPES: CompanyDocumentType[] = [
  '회사소개', 'IR·실적', '전략·보고서', 'ESG', '기술·제품', '투자·피치덱', '행사·발표',
]

export const DOC_GROUP_BY_TYPE: Record<CompanyDocumentType, CompanyDocumentGroup> = {
  '회사소개': '회사및사업',
  '전략·보고서': '회사및사업',
  '행사·발표': '회사및사업',
  'ESG': '회사및사업',
  '기술·제품': '기술및제품',
  'IR·실적': '투자및경영',
  '투자·피치덱': '투자및경영',
}

export const COMPANY_DOC_SOURCE_KINDS: CompanyDocumentSourceKind[] = [
  'API', 'RSS', 'SITEMAP', 'HTML_LIST', 'HTML_DETAIL', 'DOCUMENT_DIRECTORY', 'HEADLESS_BROWSER', 'MANUAL',
]

export const SOURCE_KIND_LABELS: Record<CompanyDocumentSourceKind, string> = {
  API: 'API',
  RSS: 'RSS',
  SITEMAP: '사이트맵',
  HTML_LIST: 'HTML 목록',
  HTML_DETAIL: 'HTML 상세',
  DOCUMENT_DIRECTORY: '문서 디렉터리',
  HEADLESS_BROWSER: '헤드리스 브라우저',
  MANUAL: '수동',
}
