export interface AdminHelpCopy {
  title: string
  what: string
  service: string
  ops: string
}

/** 페이지 단위 도움말 — AdminPageHeader 가 pathname 으로 자동 조회 */
export const ADMIN_PAGE_HELP: Record<string, AdminHelpCopy> = {
  '/admin/sources': {
    title: '소스 관리',
    what: '크롤 대상(뉴스/RSS/유튜브 채널)을 등록하고 신뢰도(trust_tier)를 설정합니다.',
    service: '수집되는 콘텐츠 전반의 출처가 됩니다.',
    ops: '신뢰할 수 있는 소스는 tier 를 상향해 게이트를 완화하세요.',
  },
  '/admin/keywords': {
    title: '카테고리 분류기준 (키워드)',
    what: '매칭·태깅·관련도 판단의 토대가 되는 키워드(포함/제외 패턴, 검색 시드)를 관리합니다.',
    service: '콘텐츠의 해시태그·관련도·필터, 크롤 키워드 수집에 반영됩니다.',
    ops: '노이즈 키워드는 제외 패턴으로, 사업축은 그룹으로 묶어 관리하세요.',
  },
  '/admin/keyword-groups': {
    title: '수집 키워드 (키워드그룹)',
    what: '수집 관련도·검색어·시그널 기준이 되는 키워드그룹(포함/제외 패턴, 검색 시드)을 관리합니다.',
    service: '콘텐츠의 해시태그·관련도·필터, 크롤 키워드 수집에 반영됩니다.',
    ops: '노이즈는 제외 패턴으로, 사업축은 그룹으로 묶어 관리하세요.',
  },
  '/admin/entities': {
    title: '엔티티 사전',
    what: '기업·기술·인물 등 엔티티를 정규화·병합하고 경쟁사·그룹을 지정합니다.',
    service: '엔티티 칩, 관계지도, 경쟁사 표시에 반영됩니다.',
    ops: '중복 엔티티는 병합하고 별칭을 잘 관리해야 매칭 정확도가 올라갑니다.',
  },
  '/admin/briefings': {
    title: '모닝브리핑',
    what: '매일 AI 가 브리핑을 생성하고, 승인·오디오(TTS) 변환을 관리합니다.',
    service: '홈/브리핑 화면에 노출됩니다.',
    ops: '생성 → 검토 → 공개 순서로 진행하고, 오디오 사용 시 TTS 설정이 필요합니다.',
  },
  '/admin/translation': {
    title: '번역/TTS 사용량',
    what: '번역·TTS 무료 한도 사용량을 모니터링합니다.',
    service: '한도 초과 시 서비스 내 번역·오디오 생성이 중단될 수 있습니다.',
    ops: '한도에 근접하면 라우팅·주기를 조정하세요.',
  },
}

export function findAdminPageHelp(pathname: string): AdminHelpCopy | null {
  const exact = ADMIN_PAGE_HELP[pathname]
  if (exact) return exact
  const match = Object.keys(ADMIN_PAGE_HELP)
    .filter((k) => pathname.startsWith(k))
    .sort((a, b) => b.length - a.length)[0]
  return match ? ADMIN_PAGE_HELP[match] : null
}

/** /admin/insights 패널별 도움말 (페이지 안에서 직접 import 해 사용) */
export const INSIGHT_GENERATION_HELP: AdminHelpCopy = {
  title: '인사이트 생성',
  what: 'AI 가 최근 기사에서 산업 인사이트(헤드라인) 카드를 생성합니다.',
  service: 'AI 인사이트 탭의 "헤드라인 분석"에 published 상태로 노출됩니다.',
  ops: '기간을 선택해 생성하고, 근거가 부족한 카드는 draft 로 남으니 검토 후 승인하세요.',
}

export const COMPANY_INSIGHT_HELP: AdminHelpCopy = {
  title: '관심업체 동향 생성',
  what: '큐레이션된 회사별 최근 동향을 AI 카드로 생성합니다.',
  service: '기업동향 > 주요 기업 그룹별 카드·상세에 노출됩니다.',
  ops: '일 1회 자동 생성 + 수동 트리거 가능. 근거 기사가 1건 이상이면 자동 published 되며, 회사 목록은 큐레이션 회사 관리에서 조정합니다.',
}

export const COMPETITOR_WEEKLY_HELP: AdminHelpCopy = {
  title: '주간 경쟁 리포트 생성',
  what: '경쟁사(통신 3사 중심) 기사를 사업영역별로 종합해 위기·기회를 판정합니다.',
  service: '경쟁사 동향(주간 리포트)의 사업영역별 종합·위기/기회·타임라인에 노출됩니다.',
  ops: '기본은 최근 완결된 주(월~일) 기준으로 생성합니다.',
}

export const SENTIMENT_HELP: AdminHelpCopy = {
  title: '논조 분석',
  what: '경쟁사 기사의 긍정/중립/부정 논조를 AI 가 판정합니다.',
  service: '내부 신호·정렬에 활용됩니다(화면에 직접 노출되지 않음).',
  ops: '최근 미분석 기사를 대상으로 주기적으로 백필하세요.',
}

export const LGU_IMPACT_HELP: AdminHelpCopy = {
  title: '위기·기회 분석',
  what: '경쟁사 기사를 LG U+ 관점에서 위기/기회/관망으로 판정합니다.',
  service: '경쟁사 동향(주간 리포트)의 위기/기회 칩·타임라인의 재료가 됩니다.',
  ops: '주기적으로 백필해 최신 판정을 유지하세요.',
}

export const YOUTUBE_TAGGING_HELP: AdminHelpCopy = {
  title: '유튜브 해시태그·엔티티 백필',
  what: '분류 없이 적재된 기존 유튜브 콘텐츠에 뉴스와 동일한 해시태그·관련 엔티티를 부여합니다.',
  service: '유튜브 카드·상세의 해시태그·관련 콘텐츠에 반영됩니다.',
  ops: '신규 수집분은 자동 태깅되므로, 이 실행은 과거 적재분에만 필요합니다.',
}

export const YOUTUBE_SUMMARY_HELP: AdminHelpCopy = {
  title: '유튜브 요약 생성',
  what: '요약 없는 유튜브에 제목·채널(추후 자막) 기반 요약을 생성합니다.',
  service: '유튜브 상세의 "주요 내용"에 노출됩니다.',
  ops: '신규 수집분은 수집 시 1회 자동 생성되므로, 이 실행은 과거 적재분에만 필요합니다.',
}
