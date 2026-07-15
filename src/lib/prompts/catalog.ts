import 'server-only'
import { FRAME_SPEC, LGU_CONTEXT } from '@/lib/competitor-weekly/frame-spec'
import { FACTS_SYSTEM_FALLBACK } from '@/lib/competitor-weekly/generate'
import { COMPANY_SYSTEM_PROMPT } from '@/lib/insight/generate'
import { RISE_FRAME_FALLBACK } from '@/lib/keywords/rise-frame'
import { STRATEGY_SYSTEM_FALLBACK } from '@/lib/reports/generate-strategy'

/**
 * 350 — 프롬프트 카탈로그.
 * 프롬프트를 쓰는 모든 생성기는 llm_prompts(key) 를 우선 로드하고 여기의 fallback 으로 폴백한다.
 * 어드민 통합 프롬프트 콘솔이 이 목록을 편집 대상으로 노출한다.
 *
 * 새 생성기에 프롬프트를 추가할 때: ① loadPrompt(admin, 'key', 상수) 로 DB 우선 로드,
 * ② 그 상수를 export, ③ 여기 카탈로그에 등록. 세 곳을 함께 갱신한다.
 */

export interface PromptCatalogEntry {
  key: string
  label: string
  group: string
  description: string
  /** DB 미저장 시 실제 사용되는 코드 상수 */
  fallback: string
}

export const PROMPT_CATALOG: PromptCatalogEntry[] = [
  {
    key: 'keyword_rise_frame',
    label: '키워드 상승 요인 — 패스② 분석 프레임',
    group: '키워드 분석',
    description: '최근 근거 사건을 시장 관심 상승 요인 3~5개로 묶는 출력 스키마와 작성 규칙.',
    fallback: RISE_FRAME_FALLBACK,
  },
  {
    key: 'competitor_weekly_facts',
    label: '경쟁사 주간 브리핑 — 패스① 사실 추출',
    group: '경쟁사 주간 브리핑',
    description: '기사에서 사건만 뽑는다. 해석 금지. {area_label} 치환됨.',
    fallback: FACTS_SYSTEM_FALLBACK,
  },
  {
    key: 'competitor_weekly_frame',
    label: '경쟁사 주간 브리핑 — 패스② 분석 프레임',
    group: '경쟁사 주간 브리핑',
    description: 'Claude 에 넘기는 애널리스트 프레임 스펙(출력 스키마·작성 규칙).',
    fallback: FRAME_SPEC,
  },
  {
    key: 'competitor_weekly_lgu_context',
    label: '경쟁사 주간 브리핑 — LG U+ 컨텍스트',
    group: '경쟁사 주간 브리핑',
    description: '비대칭 분석을 위한 우리 사업·자산 컨텍스트. 기사에 없는 정보라 고정 주입한다.',
    fallback: LGU_CONTEXT,
  },
  {
    key: 'company_insight',
    label: '주요 기업 동향 분석',
    group: '기업동향',
    description: '회사별 insight_cards 생성(card_headline·implication·citations).',
    fallback: COMPANY_SYSTEM_PROMPT,
  },
  {
    key: 'strategy_report',
    label: '전략보고서 생성(레거시 HTML 경로)',
    group: '전략보고서',
    description: 'LLM이 HTML 본문을 생성하는 기존 경로. 349-A 수동 등록 경로와 별개.',
    fallback: STRATEGY_SYSTEM_FALLBACK,
  },
]
