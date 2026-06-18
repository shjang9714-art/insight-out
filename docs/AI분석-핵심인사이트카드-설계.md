# AI 분석 — 핵심 인사이트 카드 설계 (2026-06-17)

> 정본 설계. 벤치마킹 부록(BigKinds/AlphaSense/Klue/Substack) + David 방향 반영. 변경 시 이 문서 우선.

## 0. 한 줄
AI 분석 메뉴의 심장 = **"산업동향/업체 동향을 LLM이 시사점 + 출처와 함께 카드로"**. 부록 ★최우선 **출처 인용(2-1)**을 토대로, 모든 카드는 근거(content_id + 인용)를 단다. 엔진은 하나(가공), 카드는 출력 어댑터.

## 1. 4칸 엔진 매핑 (부록 B)
- 입력: 기존 `contents`(matched_groups/keywords·importance_score) + `content_signals`(65) + 클러스터(69).
- 정규화: 이미 수집 파이프라인이 공통 포맷화.
- **가공(신규)**: 주제 그룹핑 → LLM "핵심 + 시사점 + 출처 인용" 생성 → `insight_cards` 적재.
- 출력: AI 분석 페이지 카드 / (후속) 뉴스레터·홈.

## 2. 두 축 (KA 고정 제외 — David)
- **산업동향**: 토픽/시그널별 최근 중요 움직임. (전사 공용, 배치 생성·공유.)
- **관심업체 동향**(후속): 담당자가 **자유 추가**한 업체명 → 그 이름이 잡힌 콘텐츠로 동향. (per-user 워치리스트.)

## 3. 스키마 (신규 `insight_cards`, SQL 핸드오프)
- 컬럼: `id`, `period_start date`, `period_end date`, `topic text`(주제/그룹명), `scope text`(`'industry'` | 후속 `'company'`), `headline text`, `implication text`(LGU+ B2B 시사점), `source_content_ids uuid[]`, `citations jsonb`(`[{content_id, quote}]`), `status`(draft/published/archived, briefings enum 재사용 또는 신규), `generated_at`, `created_at`, `updated_at`.
- RLS: 인증 사용자 published 조회 / admin 전체. (briefings 정책 미러.)
- 멱등: `unique(period_start, scope, topic)`.

## 4. 생성 로직 (가공 엔진)
1. 기간(기본 최근 7일) published 콘텐츠 수집: `importance_score` 상위 + `content_signals`/`matched_groups` 보유분.
2. **주제 그룹핑**: `matched_groups`(토픽 규칙) 또는 `signal_type` 기준 상위 N개 테마. 각 테마에 대표 기사(클러스터 대표 우선) 3~8건.
3. **LLM 생성**(`llmComplete('report', …)`): 테마별 기사 제목+요약+content_id 입력 → JSON 출력 `{ headline, implication, citations:[{content_id, quote(≤15단어)}] }`. 환각 억제: 인용 못 대는 주장 금지(2-1).
4. `insight_cards` 적재(멱등). 예산(테마 수 상한)·실패 graceful.

## 5. 출력 (AI 분석 페이지)
- 카드: headline + implication + **출처 칩**(content_id → `/dashboard/contents/{id}`). 기간 표기.
- (후속) 키워드 맵 4분류·뜨는 토픽·경쟁사 동향 위젯이 같은 페이지에 합류.

## 6. 트리거
- 어드민 수동 생성 버튼(모닝브리핑 패턴 미러) + (후속) 크론. **자동 노출 전 admin 검토** 권장(draft→published).

## 7. 로드맵(슬라이스)
1. **89**: insight_cards 스키마 + 산업동향 생성 엔진 + 어드민 트리거 + 최소 표시(AI 분석 페이지).
2. 90: AI 분석 페이지 정식(카드 + 출처 인용 UI 다듬기).
3. 관심업체 워치리스트(자유추가 + 키워드 매칭, per-user 'company' scope).
4. 키워드 맵 4분류 / 뜨는 토픽(집계) / 경쟁사 동향+논조 / (P2) 화이트스페이스·관계도.

## 8. 결정 기록
- KA 53곳 고정 제외 → 산업동향 + 사용자 자유추가 워치리스트.
- 출처 인용(2-1)은 토대 — 모든 카드 필수.
- 엔진 1개·카드 N개(출력 어댑터). 카드마다 LLM 따로 X.
- 관련: 벤치마킹 부록, content_signals(65), briefings 패턴, 사용자-IA 3평면 설계.
