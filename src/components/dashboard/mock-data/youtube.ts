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
