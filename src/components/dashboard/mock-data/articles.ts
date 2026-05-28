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
