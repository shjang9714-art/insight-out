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
