export const MOCK_USER = {
  name: '장수희',
  team: '기업솔루션팀',
}

export const TODAY_UPDATES = 34

export const NOTIFICATIONS = [
  { id: '1', text: '보안/클라우드 관련 신규 아티클 5건이 수집됐습니다', time: '5분 전', read: false },
  { id: '2', text: 'AICC 경쟁사 동향 업데이트 — KT, LG U+ 신규 발표', time: '1시간 전', read: false },
  { id: '3', text: '이번 주 에디터 픽이 업데이트됐습니다', time: '3시간 전', read: true },
  { id: '4', text: 'Private 5G 트렌드 키워드 급상승 감지', time: '어제', read: true },
]

export const MY_SERVICES_NAV = [
  { id: 'aicc', label: 'AICC', icon: '🤖', count: 8 },
  { id: 'connectivity', label: 'Connectivity', icon: '🔗', count: 5 },
  { id: 'security-cloud', label: '보안/클라우드', icon: '🔒', count: 12 },
  { id: 'm2m', label: 'M2M', icon: '📡', count: 3 },
]

export const BOOKMARKED_ARTICLES = [
  { id: '1', title: 'AICC 2.0 시대: 생성형 AI가 바꾸는 콜센터의 미래', category: '가트너 리포트', date: '2026.05.20' },
  { id: '2', title: '제로 트러스트 실전 도입 가이드 — 국내 금융권 사례 중심', category: '웹 인사이트', date: '2026.05.19' },
  { id: '3', title: 'Gartner: 2026 AICC 시장 규모 전망', category: '가트너 리포트', date: '2026.05.15' },
]

export const RECENT_VIEWS = [
  { id: '1', title: 'Gartner: 2026년까지 기업의 75%가 제로 트러스트 도입 예정', time: '10분 전' },
  { id: '2', title: 'AWS Bedrock 멀티 에이전트 서비스 국내 GA', time: '1시간 전' },
  { id: '3', title: 'Private 5G vs Wi-Fi 6E — 제조현장 선택 기준', time: '어제' },
]

export const SAVED_KEYWORDS = ['AI 에이전트', 'Private 5G', '제로 트러스트', 'GenAI']

export type AIReport = {
  id: string
  title: string
  service: string
  period: string
  date: string
  llm?: string
  summary: string
  insights: string[]
  sources: { title: string; source: string; date: string }[]
}

export type SelectableContent = {
  id: string
  title: string
  source: string
  tag: string
}

export const SELECTABLE_CONTENT: SelectableContent[] = [
  { id: 'feed-1', title: 'AWS, 기업용 AI 에이전트 서비스 국내 출시 — 콜센터·RPA 시장 판도 변화 예고', source: 'ZDNet Korea', tag: 'AICC' },
  { id: 'feed-2', title: 'Gartner: 2026년까지 기업의 75%가 제로 트러스트 아키텍처 도입 예정', source: 'Gartner Blog', tag: '보안/클라우드' },
  { id: 'feed-3', title: 'Private 5G가 스마트팩토리의 판을 바꾼다 — 제조업 연결성 혁신', source: 'Medium', tag: 'Connectivity' },
  { id: 'feed-4', title: '현대차, 차량 데이터 플랫폼 고도화 — M2M·V2X 통합 솔루션 발주', source: '전자신문', tag: 'M2M' },
  { id: 'feed-5', title: '2026 국내 클라우드 보안 시장 전망 — MSSP 성장률 34% 예측', source: 'KRG Research', tag: '보안/클라우드' },
  { id: 'pick-1', title: 'AICC 2.0 시대: 생성형 AI가 바꾸는 콜센터의 미래', source: '가트너 리포트', tag: 'AICC' },
  { id: 'pick-2', title: '제로 트러스트 실전 도입 가이드 — 국내 금융권 사례 중심', source: '웹 인사이트', tag: '보안/클라우드' },
  { id: 'pick-3', title: 'Private 5G vs Wi-Fi 6E — 제조현장 선택 기준 완전 정리', source: '뉴스레터', tag: 'Connectivity' },
]

export const AI_REPORTS: AIReport[] = [
  {
    id: '1',
    title: 'AICC 시장 동향 및 경쟁사 분석',
    service: 'AICC',
    period: '2026년 1분기',
    date: '2026.05.24',
    summary: 'AI 콜센터(AICC) 시장이 2026년 1분기 기준 전년 대비 42% 성장세를 기록했다. KT·LG U+의 SMB 타깃 패키지 출시와 AWS Bedrock 기반 글로벌 서비스의 국내 진입이 맞물리며 경쟁이 본격화되고 있다. 특히 감성 분석과 실시간 코칭 기능이 고객사 도입 결정의 핵심 요인으로 부상했다.',
    insights: [
      'KT와 LG U+가 SMB 시장 공략을 위해 월정액 패키지를 신규 출시하며 가격 경쟁 심화',
      'AWS Bedrock 기반 멀티 에이전트 서비스 출시로 글로벌 빅테크의 국내 AICC 시장 진입 본격화',
      '감성 분석·실시간 코칭 기능이 고객사 도입 결정의 핵심 요인으로 부상',
      '공공·금융 부문 컴플라이언스 요건 강화로 온프레미스 하이브리드 AICC 수요 증가 예상',
    ],
    sources: [
      { title: 'AWS, 기업용 AI 에이전트 서비스 국내 출시', source: 'ZDNet Korea', date: '2026.05.24' },
      { title: 'AICC 2.0 시대: 생성형 AI가 바꾸는 콜센터의 미래', source: '가트너 리포트', date: '2026.05.20' },
      { title: 'KT AI Contact 무상 체험 프로그램 런칭', source: '전자신문', date: '2026.05.23' },
    ],
  },
  {
    id: '2',
    title: 'Private 5G 스마트팩토리 시장 현황',
    service: 'Connectivity',
    period: '2026년 상반기',
    date: '2026.05.21',
    summary: 'Private 5G 기반 스마트팩토리 구축 사업이 국내 제조업 전반으로 확산되고 있다. LG U+의 현대제철 레퍼런스 확보를 계기로 대기업 제조사 공략 경쟁이 본격화됐으며, 정부의 스마트제조 2.0 정책과 맞물려 공공 조달 기회도 확대되고 있다.',
    insights: [
      'LG U+의 현대제철 레퍼런스 확보로 대기업 제조사 공략 경쟁 본격화',
      'Wi-Fi 6E 대비 Private 5G의 TCO 우위는 3년 이상 운영 시 명확히 나타남',
      '정부 스마트제조 2.0 정책과 맞물려 공공 조달 기회 확대 예상',
    ],
    sources: [
      { title: 'Private 5G가 스마트팩토리의 판을 바꾼다', source: 'Medium', date: '2026.05.19' },
      { title: 'LG U+ Private 5G 현대제철 구축 완료', source: '전자신문', date: '2026.05.22' },
    ],
  },
]

export const SERVICES = [
  { id: 'all', label: '전체' },
  { id: 'connectivity', label: 'Connectivity' },
  { id: 'security-cloud', label: '보안/클라우드' },
  { id: 'm2m', label: 'M2M' },
  { id: 'aicc', label: 'AICC' },
  { id: 'aidc', label: 'AIDC' },
  { id: 'mobility', label: '모빌리티' },
  { id: 'enterprise', label: '기업솔루션' },
]

export const CATEGORIES = [
  { id: 'news', icon: '📰', label: '뉴스 & 미디어', count: 24 },
  { id: 'gartner', icon: '📊', label: '가트너 리포트', count: 3 },
  { id: 'krg', icon: '📋', label: 'KRG 리포트', count: 2 },
  { id: 'web-insight', icon: '💡', label: '웹 인사이트', count: 11 },
  { id: 'opinion', icon: '💼', label: '오피니언 채널', count: 7 },
  { id: 'newsletter', icon: '📧', label: '뉴스레터', count: 4 },
  { id: 'ai-report', icon: '🤖', label: 'AI 보고서', count: 0 },
  { id: 'youtube', icon: '▶️', label: '유튜브 영상', count: 6 },
]

/** YouTube Data API v3 — video resource (subset) */
export type YoutubeVideo = {
  kind: 'youtube#video'
  etag: string
  id: string
  snippet: {
    publishedAt: string
    channelId: string
    title: string
    description: string
    thumbnails: {
      default: { url: string; width: number; height: number }
      medium: { url: string; width: number; height: number }
      high: { url: string; width: number; height: number }
    }
    channelTitle: string
    tags?: string[]
    categoryId: string
    liveBroadcastContent: 'none' | 'live' | 'upcoming'
    localized: { title: string; description: string }
    defaultAudioLanguage?: string
  }
  statistics: {
    viewCount: string
    likeCount: string
    favoriteCount: string
    commentCount: string
  }
  service: string
}

export const YOUTUBE_VIDEOS: YoutubeVideo[] = [
  {
    kind: 'youtube#video',
    etag: 'mock-etag-aicc-1',
    id: 'mock_aicc_001',
    snippet: {
      publishedAt: '2026-05-23T09:00:00Z',
      channelId: 'UC_aws_korea',
      title: 'Amazon Bedrock 멀티 에이전트 오케스트레이션 — AICC 구축 실전 가이드',
      description: 'AWS Bedrock 기반 멀티 에이전트 서비스를 활용해 AI 콜센터를 구축하는 방법을 단계별로 안내합니다.',
      thumbnails: {
        default: { url: 'https://i.ytimg.com/vi/mock_aicc_001/default.jpg', width: 120, height: 90 },
        medium: { url: 'https://i.ytimg.com/vi/mock_aicc_001/mqdefault.jpg', width: 320, height: 180 },
        high: { url: 'https://i.ytimg.com/vi/mock_aicc_001/hqdefault.jpg', width: 480, height: 360 },
      },
      channelTitle: 'AWS Korea',
      tags: ['AI', 'AICC', 'Bedrock', 'MultiAgent'],
      categoryId: '28',
      liveBroadcastContent: 'none',
      localized: { title: 'Amazon Bedrock 멀티 에이전트 오케스트레이션 — AICC 구축 실전 가이드', description: '' },
      defaultAudioLanguage: 'ko',
    },
    statistics: { viewCount: '15420', likeCount: '342', favoriteCount: '0', commentCount: '28' },
    service: 'AICC',
  },
  {
    kind: 'youtube#video',
    etag: 'mock-etag-conn-1',
    id: 'mock_conn_001',
    snippet: {
      publishedAt: '2026-05-20T06:00:00Z',
      channelId: 'UC_lguplus',
      title: 'Private 5G 스마트팩토리 구축기 — 현대제철 레퍼런스 공개',
      description: 'LG U+가 현대제철과 함께 구축한 Private 5G 기반 스마트팩토리 사례를 상세히 소개합니다.',
      thumbnails: {
        default: { url: 'https://i.ytimg.com/vi/mock_conn_001/default.jpg', width: 120, height: 90 },
        medium: { url: 'https://i.ytimg.com/vi/mock_conn_001/mqdefault.jpg', width: 320, height: 180 },
        high: { url: 'https://i.ytimg.com/vi/mock_conn_001/hqdefault.jpg', width: 480, height: 360 },
      },
      channelTitle: 'LG U+ Enterprise',
      tags: ['Private5G', 'SmartFactory', 'Connectivity'],
      categoryId: '28',
      liveBroadcastContent: 'none',
      localized: { title: 'Private 5G 스마트팩토리 구축기 — 현대제철 레퍼런스 공개', description: '' },
      defaultAudioLanguage: 'ko',
    },
    statistics: { viewCount: '9830', likeCount: '215', favoriteCount: '0', commentCount: '14' },
    service: 'Connectivity',
  },
  {
    kind: 'youtube#video',
    etag: 'mock-etag-sec-1',
    id: 'mock_sec_001',
    snippet: {
      publishedAt: '2026-05-18T03:00:00Z',
      channelId: 'UC_ms_korea',
      title: '제로 트러스트 보안 아키텍처 설계 원칙 — Microsoft 세션',
      description: 'Microsoft Entra와 Defender를 활용한 제로 트러스트 구현 전략과 국내 금융권 적용 사례를 소개합니다.',
      thumbnails: {
        default: { url: 'https://i.ytimg.com/vi/mock_sec_001/default.jpg', width: 120, height: 90 },
        medium: { url: 'https://i.ytimg.com/vi/mock_sec_001/mqdefault.jpg', width: 320, height: 180 },
        high: { url: 'https://i.ytimg.com/vi/mock_sec_001/hqdefault.jpg', width: 480, height: 360 },
      },
      channelTitle: 'Microsoft Korea',
      tags: ['ZeroTrust', 'Security', 'Cloud'],
      categoryId: '28',
      liveBroadcastContent: 'none',
      localized: { title: '제로 트러스트 보안 아키텍처 설계 원칙 — Microsoft 세션', description: '' },
      defaultAudioLanguage: 'ko',
    },
    statistics: { viewCount: '22100', likeCount: '489', favoriteCount: '0', commentCount: '53' },
    service: '보안/클라우드',
  },
  {
    kind: 'youtube#video',
    etag: 'mock-etag-m2m-1',
    id: 'mock_m2m_001',
    snippet: {
      publishedAt: '2026-05-15T07:00:00Z',
      channelId: 'UC_kt_enterprise',
      title: 'M2M 차량관제 플랫폼 데모 — 실시간 GPS 추적부터 이상 감지까지',
      description: 'KT 엔터프라이즈 M2M 차량관제 솔루션의 주요 기능과 도입 효과를 실제 데모와 함께 소개합니다.',
      thumbnails: {
        default: { url: 'https://i.ytimg.com/vi/mock_m2m_001/default.jpg', width: 120, height: 90 },
        medium: { url: 'https://i.ytimg.com/vi/mock_m2m_001/mqdefault.jpg', width: 320, height: 180 },
        high: { url: 'https://i.ytimg.com/vi/mock_m2m_001/hqdefault.jpg', width: 480, height: 360 },
      },
      channelTitle: 'KT Enterprise',
      tags: ['M2M', 'IoT', 'FleetManagement'],
      categoryId: '28',
      liveBroadcastContent: 'none',
      localized: { title: 'M2M 차량관제 플랫폼 데모 — 실시간 GPS 추적부터 이상 감지까지', description: '' },
      defaultAudioLanguage: 'ko',
    },
    statistics: { viewCount: '6740', likeCount: '98', favoriteCount: '0', commentCount: '7' },
    service: 'M2M',
  },
  {
    kind: 'youtube#video',
    etag: 'mock-etag-aidc-1',
    id: 'mock_aidc_001',
    snippet: {
      publishedAt: '2026-05-12T08:00:00Z',
      channelId: 'UC_nvidia_korea',
      title: 'AI 데이터센터 GPU 인프라 최적화 — DGX SuperPOD 도입 사례',
      description: 'NVIDIA DGX SuperPOD를 활용한 AI 데이터센터 구성 전략과 실제 성능 벤치마크 결과를 공유합니다.',
      thumbnails: {
        default: { url: 'https://i.ytimg.com/vi/mock_aidc_001/default.jpg', width: 120, height: 90 },
        medium: { url: 'https://i.ytimg.com/vi/mock_aidc_001/mqdefault.jpg', width: 320, height: 180 },
        high: { url: 'https://i.ytimg.com/vi/mock_aidc_001/hqdefault.jpg', width: 480, height: 360 },
      },
      channelTitle: 'NVIDIA Korea',
      tags: ['AIDC', 'GPU', 'DataCenter', 'DGX'],
      categoryId: '28',
      liveBroadcastContent: 'none',
      localized: { title: 'AI 데이터센터 GPU 인프라 최적화 — DGX SuperPOD 도입 사례', description: '' },
      defaultAudioLanguage: 'ko',
    },
    statistics: { viewCount: '31500', likeCount: '712', favoriteCount: '0', commentCount: '89' },
    service: 'AIDC',
  },
  {
    kind: 'youtube#video',
    etag: 'mock-etag-ent-1',
    id: 'mock_ent_001',
    snippet: {
      publishedAt: '2026-05-10T05:00:00Z',
      channelId: 'UC_sap_korea',
      title: 'SAP S/4HANA Cloud 전환 로드맵 — 국내 제조업 ERP 클라우드 이관 전략',
      description: '국내 제조 대기업의 SAP ERP 클라우드 전환 여정과 핵심 성공 요인을 실무 사례 중심으로 분석합니다.',
      thumbnails: {
        default: { url: 'https://i.ytimg.com/vi/mock_ent_001/default.jpg', width: 120, height: 90 },
        medium: { url: 'https://i.ytimg.com/vi/mock_ent_001/mqdefault.jpg', width: 320, height: 180 },
        high: { url: 'https://i.ytimg.com/vi/mock_ent_001/hqdefault.jpg', width: 480, height: 360 },
      },
      channelTitle: 'SAP Korea',
      tags: ['ERP', 'Cloud', 'S4HANA', 'Enterprise'],
      categoryId: '28',
      liveBroadcastContent: 'none',
      localized: { title: 'SAP S/4HANA Cloud 전환 로드맵 — 국내 제조업 ERP 클라우드 이관 전략', description: '' },
      defaultAudioLanguage: 'ko',
    },
    statistics: { viewCount: '8920', likeCount: '167', favoriteCount: '0', commentCount: '19' },
    service: '기업솔루션',
  },
]

export const TREND_KEYWORDS = [
  { keyword: 'AI 에이전트', count: 142, size: 'xl' as const },
  { keyword: 'Private 5G', count: 98, size: 'lg' as const },
  { keyword: '제로 트러스트', count: 87, size: 'lg' as const },
  { keyword: 'GenAI', count: 76, size: 'md' as const },
  { keyword: 'SaaS 전환', count: 65, size: 'md' as const },
  { keyword: 'SASE', count: 54, size: 'md' as const },
  { keyword: '클라우드 네이티브', count: 49, size: 'sm' as const },
  { keyword: 'IoT 플랫폼', count: 43, size: 'sm' as const },
  { keyword: 'MSP', count: 38, size: 'sm' as const },
  { keyword: '디지털 전환', count: 35, size: 'sm' as const },
  { keyword: 'SD-WAN', count: 30, size: 'xs' as const },
  { keyword: 'MVNO', count: 27, size: 'xs' as const },
]

export const RECENT_FEED = [
  {
    id: '1',
    category: '뉴스 & 미디어',
    categoryColor: 'blue',
    title: 'AWS, 기업용 AI 에이전트 서비스 국내 출시 — 콜센터·RPA 시장 판도 변화 예고',
    summary: 'AWS가 Amazon Bedrock 기반 멀티 에이전트 오케스트레이션 서비스를 국내 출시했다. AICC·RPA 시장에서 기존 SI 벤더와의 경쟁이 심화될 전망이다.',
    source: 'ZDNet Korea',
    time: '2시간 전',
    service: 'AICC',
  },
  {
    id: '2',
    category: '웹 인사이트',
    categoryColor: 'yellow',
    title: 'Gartner: 2026년까지 기업의 75%가 제로 트러스트 아키텍처 도입 예정',
    summary: '가트너 최신 보고서에 따르면 사이버 위협 증가로 제로 트러스트 전환이 가속화되고 있으며, 특히 금융·공공 부문의 채택률이 두드러진다.',
    source: 'Gartner Blog',
    time: '4시간 전',
    service: '보안/클라우드',
  },
  {
    id: '3',
    category: '오피니언 채널',
    categoryColor: 'purple',
    title: 'Private 5G가 스마트팩토리의 판을 바꾼다 — 제조업 연결성 혁신',
    summary: '자체 5G망 구축을 통한 초저지연·고신뢰 통신이 스마트팩토리 구현의 핵심으로 부상. 국내 제조 대기업의 PoC 사례 분석.',
    source: 'Medium · 홍길동',
    time: '6시간 전',
    service: 'Connectivity',
  },
  {
    id: '4',
    category: '뉴스 & 미디어',
    categoryColor: 'blue',
    title: '현대차, 차량 데이터 플랫폼 고도화 — M2M·V2X 통합 솔루션 발주',
    summary: '현대자동차그룹이 차량-인프라 연결을 위한 M2M 통합 플랫폼 구축 사업을 발주했다. 예산 규모 약 300억 원으로 하반기 착수 예정.',
    source: '전자신문',
    time: '8시간 전',
    service: 'M2M',
  },
  {
    id: '5',
    category: 'KRG 리포트',
    categoryColor: 'green',
    title: '2026 국내 클라우드 보안 시장 전망 — MSSP 성장률 34% 예측',
    summary: 'KRG 리서치는 2026년 국내 클라우드 보안 관리 서비스(MSSP) 시장이 전년 대비 34% 성장할 것으로 전망했다.',
    source: 'KRG Research',
    time: '어제',
    service: '보안/클라우드',
  },
]

export const EDITOR_PICKS = [
  {
    id: '1',
    badge: 'PICK 01',
    title: 'AICC 2.0 시대: 생성형 AI가 바꾸는 콜센터의 미래',
    description: '단순 자동화를 넘어 감성 대화·실시간 코칭·VOC 자동 분석까지 — 국내외 AICC 혁신 사례 종합 분석',
    category: '가트너 리포트',
    date: '2026.05.20',
  },
  {
    id: '2',
    badge: 'PICK 02',
    title: '제로 트러스트 실전 도입 가이드 — 국내 금융권 사례 중심',
    description: '개념이 아닌 실행. KB금융·신한은행의 제로 트러스트 전환 여정과 주요 의사결정 포인트를 심층 분석했다.',
    category: '웹 인사이트',
    date: '2026.05.19',
  },
  {
    id: '3',
    badge: 'PICK 03',
    title: 'Private 5G vs Wi-Fi 6E — 제조현장 선택 기준 완전 정리',
    summary: '스마트팩토리 구축을 앞둔 기업을 위한 무선 네트워크 기술 비교 분석. TCO·지연시간·보안성·확장성 4가지 기준 제시.',
    category: '뉴스레터',
    date: '2026.05.18',
  },
]

export const COMPETITOR_TRENDS = [
  {
    id: '1',
    company: 'KT',
    logo: 'KT',
    color: 'red',
    items: [
      { text: 'AI 콜센터 솔루션 "KT AI Contact" 기업 무상 체험 프로그램 런칭', time: '1일 전' },
      { text: '클라우드 관리형 보안 서비스(MSSP) 신규 패키지 출시 — 중견기업 타깃', time: '3일 전' },
    ],
  },
  {
    id: '2',
    company: 'LG U+',
    logo: 'U+',
    color: 'pink',
    items: [
      { text: 'Private 5G 기반 스마트팩토리 레퍼런스 확보 — 현대제철 구축 완료', time: '2일 전' },
      { text: 'M2M 차량 관제 플랫폼 신규 고객 20개사 확보 발표', time: '5일 전' },
    ],
  },
  {
    id: '3',
    company: 'AWS',
    logo: 'AWS',
    color: 'orange',
    items: [
      { text: 'Amazon Bedrock 멀티 에이전트 서비스 국내 GA — AICC 시장 공략 본격화', time: '2시간 전' },
      { text: 'AWS Seoul Region 두 번째 AZ 추가 — 금융·공공 워크로드 타깃', time: '4일 전' },
    ],
  },
]
