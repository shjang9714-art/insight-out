/**
 * 맞춤 추천 피드의 카테고리 정의 — 단일 출처(single source of truth).
 *
 * 사용자는 개별 해시태그가 아니라 "카테고리"만 선택한다(팝업 다중 선택).
 * 선택한 카테고리에 속한 해시태그 전체를 백엔드 매칭에 사용한다:
 * 추천 RPC(get_recommended_feed)에 p_hashtags 로 전달되어
 * contents.matched_keywords / matched_groups 배열과 overlap(&&) 매칭된다.
 *
 * 해시태그 추가/수정은 이 파일 한 곳에서만 하면 된다.
 */

export interface FeedCategory {
  /** 저장/식별용 안정 키 (users.feed_categories 에 이 값이 저장됨) */
  key: string
  /** 화면 표시 라벨 */
  label: string
  /** 이 카테고리에 속한 해시태그(매칭 키워드) 전체 */
  hashtags: string[]
}

export const FEED_CATEGORIES: FeedCategory[] = [
  {
    key: 'telecom',
    label: '통신',
    hashtags: [
      '통신', '네트워크', '이동통신', '5G', '6G', '광통신', '광케이블', '광섬유',
      '광모듈', '광트랜시버', '해저케이블', '데이터센터', 'IDC', '백본망', '코어망',
      '기지국', 'Open RAN', 'O-RAN', '위성통신', 'LEO Starlink', 'IoT', 'NB-IoT',
      '네트워크장비', '라우터', '스위치', 'SDN', 'NFV', 'MEC', 'AI-RAN', '망중립성',
      '주파수', '통신사',
    ],
  },
  {
    key: 'security',
    label: '보안',
    hashtags: [
      '사이버보안', '정보보안', '사이버공격', '해킹', '랜섬웨어', '악성코드', 'APT',
      '피싱', 'DDoS', '보안취약점', 'CVE', 'Zero-Day', '보안패치', '모의해킹', 'IAM',
      'MFA', 'Passkey', '방화벽', 'WAF', 'VPN', 'SASE', '클라우드보안', 'CSPM',
      'CNAPP', 'API Security', 'DevSecOps', 'SOC', 'SIEM', 'SOAR', 'EDR', 'XDR',
      'Threat Intelligence', '위협헌팅', 'AI 보안', 'LLM 보안', 'Prompt Injection',
      '양자암호', 'PQC', 'ISMS', 'GDPR', 'NIST', 'OKTA',
    ],
  },
  {
    key: 'mobility',
    label: '모빌리티',
    hashtags: [
      '모빌리티', '스마트모빌리티', '자동차', '전기차', 'EV', '수소차', '배터리',
      '이차전지', '전고체배터리', 'BMS', '전기차충전', '급속충전', 'V2G', '자율주행',
      'ADAS', '로보택시', 'LiDAR', 'SDV', 'Software Defined Vehicle', 'OTA',
      '커넥티드카', 'V2X', '차량용반도체', '차량AI', '디지털콕핏', 'UAM', 'AAM',
      'eVTOL', '도심항공교통', 'MaaS', '카셰어링', '스마트물류',
    ],
  },
  {
    key: 'aidc',
    label: 'AIDC',
    hashtags: [
      'AIDC', 'AI 데이터센터', 'AI Infrastructure', '데이터센터', 'Hyperscale',
      'AI 서버', 'GPU 서버', 'GPU 클러스터', 'HPC', 'GPU', 'AI Accelerator', 'HBM',
      'NVIDIA', 'Blackwell', 'GB200', 'AMD Instinct', 'AI 반도체', 'AI 칩',
      'InfiniBand', 'Ethernet', 'DCI', '광통신', '실리콘 포토닉스',
      'Silicon Photonics', 'CPO', '광모듈', '800G Ethernet', '1.6T Ethernet',
      '액침냉각', 'Liquid Cooling', 'DLC', '데이터센터 전력', 'UPS', 'AI 클라우드',
      'GPU Cloud',
    ],
  },
  {
    key: 'aicc',
    label: 'AICC',
    hashtags: [
      'AICC', 'AI 컨택센터', 'AI Contact Center', 'AI 고객센터', 'AI 콜센터',
      '컨택센터', '콜센터', '고객센터', 'AI 상담원', 'AI Agent', '상담 자동화',
      'Voice AI', 'ASR', 'STT', 'TTS', 'Voicebot', '챗봇', 'Conversational AI',
      '생성형 AI', 'LLM', 'RAG', 'Agent Assist', '상담 코파일럿',
      'Speech Analytics', 'CCaaS', 'Amazon Connect', 'Genesys', 'Five9', 'NICE',
      'Talkdesk',
    ],
  },
  {
    key: 'ai',
    label: 'AI',
    hashtags: [
      '인공지능', 'AI', '생성형 AI', 'LLM', '거대언어모델', '머신러닝', '딥러닝',
      '파운데이션 모델', 'GPT', 'Gemini', 'Claude', 'AI 에이전트', 'Agentic AI',
      'AGI', 'AI 반도체', 'AI 서비스', 'AI 플랫폼', 'AI 윤리', 'AI 규제',
      '멀티모달', 'sLLM', 'On-device AI',
    ],
  },
  {
    key: 'finance',
    label: '금융',
    hashtags: [
      '금융', '핀테크', '디지털금융', '오픈뱅킹', '마이데이터', '전자금융', '금융AI',
      '금융보안', '인터넷은행', '증권', '보험', '자산관리', '블록체인 금융', 'CBDC',
      '스테이블코인', '결제', '간편결제', '금융규제', '망분리',
    ],
  },
  {
    key: 'public',
    label: '공공',
    hashtags: [
      '공공', '공공기관', '정부', '전자정부', '스마트시티', '공공데이터', '공공클라우드',
      '행정전산망', '디지털플랫폼정부', '공공조달', '지자체', '공공보안', '국방',
      '국가정보자원관리원',
    ],
  },
  {
    key: 'enterprise-group',
    label: '대기업그룹사',
    hashtags: [
      '대기업그룹사', '대기업', '그룹사', '계열사', '대기업IT', '사내SI', '그룹IT',
      '전사시스템', 'ERP', '대기업DX', '지주회사',
    ],
  },
  {
    key: 'global-bigtech',
    label: '글로벌 빅테크',
    hashtags: [
      '빅테크', 'Google', 'Microsoft', 'Amazon', 'Meta', 'Apple', 'OpenAI',
      'NVIDIA', '글로벌테크', '실리콘밸리', '테크기업', '클라우드빅3', 'AWS',
      'Azure', 'GCP',
    ],
  },
  {
    key: 'startup',
    label: '스타트업',
    hashtags: [
      '스타트업', '창업', '벤처', '투자유치', '시리즈A', '시리즈B', '유니콘',
      '액셀러레이터', 'VC', '벤처캐피털', '스케일업', '테크스타트업',
    ],
  },
]

export const CATEGORY_BY_KEY: Record<string, FeedCategory> = Object.fromEntries(
  FEED_CATEGORIES.map((category) => [category.key, category])
)

export const FEED_CATEGORY_KEYS: string[] = FEED_CATEGORIES.map((c) => c.key)

/** 카테고리 키 목록 → 해시태그 전체(중복 제거). 잘못된 키는 무시. */
export function hashtagsForCategories(keys: string[]): string[] {
  const seen = new Set<string>()
  for (const key of keys) {
    const category = CATEGORY_BY_KEY[key]
    if (!category) continue
    for (const tag of category.hashtags) seen.add(tag)
  }
  return [...seen]
}

/** 유효한 카테고리 키만 남긴다(중복 제거, 정의 순서 유지). */
export function sanitizeCategoryKeys(keys: string[]): string[] {
  const set = new Set(keys)
  return FEED_CATEGORY_KEYS.filter((key) => set.has(key))
}
