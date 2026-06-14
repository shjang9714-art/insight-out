# 묶음 B — LLM 양질 엔진 설계 (관련도·태깅·시그널 + 무료 키 풀 + 토큰 최적화)

> 작성: Opus(Cowork) · 2026-06-13 · 성격: 설계/ADR(지시서 전 단계)
> 부모: `docs/뉴스수집-웹인사이트-개선안-2026-06-13.md` · 선행 완료: 지시서 49(EXCLUDE), 50(수집 4분류)
> 후속: 이 문서를 근거로 B1~B5 지시서로 분해.

---

## 0. 목표

뉴스 "양질"의 핵심 레버. 현재 관련도=이진(`includes`), 태깅=단순 부분일치(오탐 多), 시그널=부재. 이를 **결정적 키워드그룹 + LLM 보조**로 바꿔 ① 불필요 기사 정확 차단 ② 의미있는 태그 ③ signal-insight 토대를 만든다.

**대원칙(David 결정 반영)**
- LLM 범위: **관련도 차단 + 태깅 + 시그널 전부**(가능하면 한 묶음 호출로 동시).
- 무료 LLM: **여러 제공자 혼합 풀**(Gemini Flash + Groq + OpenRouter) 라운드로빈/쿼터 라우팅.
- 토큰 여유 적음 → **계층형(싼 것 먼저) + 배치 + 최소 IO** 필수.
- LLM 키 소진/장애 시 **결정적 로직으로 graceful degradation**(시스템 안 멈춤).

---

## 1. 아키텍처 결정 (확정)

1. **점수 1회 산정 → 공유.** `importance_score`(뉴스)·`insight_score`(웹인사이트)를 한 번 계산해 필터·번역티어·정렬·추천이 공유. 매 기능 재계산 금지.
2. **결정적 바닥 + LLM 보강.** 키워드그룹 매칭·최신성·소스신뢰도·중복도는 무료 계산(바닥). 전문성·시사점·미묘한 관련도만 LLM(보강). 키 소진 시 바닥만으로 동작.
3. **keyword_groups 가 3役 통합.** include/exclude/weight 로 ① 관련도 가중점수 ② EXCLUDE 블랙리스트(49 흡수) ③ 태그 부여를 한 메커니즘으로.
4. **스키마는 확장**(신규 테이블 최소). `contents` 에 컬럼 추가, `keywords` 진화.
5. **enum 비파괴**(ADD/RENAME만).
6. **LLM 키 풀 = 번역 폴백 패턴 재사용.** `src/lib/translate/index.ts` 의 구조(provider 배열 + `isConfigured()` + `monthlyXLimit` + `*_usage`/`*_settings` 테이블 + increment RPC + 순차 폴백)를 그대로 복제.

---

## 2. 파이프라인 순서 (고정)

크롤 배치(아침) 내 1기사 처리 순서:

```
dedup(URL→bodyHash→titleHash, +canonical_url 정규화)
  → 결정적 점수 산정 (keyword_groups 매칭·최신성·소스 trust·중복도) + EXCLUDE 차감
  → 게이트: score < threshold → status=pending(승인 큐), ≥ → 후속
  → 중요도 티어 번역 (high=DeepL, low=LLM 풀 / 한국어=skip)
  → LLM 배치 (애매한 것만, N건 묶음): 관련도 재판정 + 태그 + 시그널 (+웹인사이트 카드필드)
  → contents 적재 + content_tags/content_signals 적재
```

- **게이트 ON 은 B1에서** (키워드그룹으로 커버리지 확보 후). 49의 `RELATEDNESS_GATING_ENABLED=false`를 true로.
- LLM 단계는 B2(게이트웨이)·B3(연결) 후 활성. 그전까지 결정적 점수만으로 게이트 동작.

---

## 3. 스키마 변경

| 테이블/타입 | 변경 | 지시서 |
|---|---|---|
| `keyword_groups`(신규) | id, name, kind(enum), description, include_patterns text[], exclude_patterns text[], weight numeric, signal_hint(signal_type, nullable), is_active | B1 |
| `keywords` 확장 | `tag_type`(enum) + `normalized_name` 추가(별칭/표기흔들림 흡수). `is_competitor`는 tag_type='company'로 흡수(컬럼은 유지) | B3 |
| `signal_type`(신규 enum) | 아래 §6 목록 | B4 |
| `content_signals`(신규) | content_id, signal_type, score, source('rule'|'llm'), created_at + RLS | B4 |
| `content_tags` 또는 기존 `content_keywords` 재사용 | item↔tag. **권장: content_keywords 유지**(태그=진화한 keywords) | B3 |
| `contents` 확장 | `importance_score` numeric, `insight_score` numeric, `canonical_url` text, `translation_status`(enum) | B1(score)·B5(translation_status) |
| `llm_usage`(신규) | provider, period(월), tokens, calls | B2 |
| `llm_settings`(신규) | provider, enabled, monthly_token_limit | B2 |

- LLM **키 자체는 DB에 저장 금지** → env 변수(`GEMINI_API_KEY_1..N`, `GROQ_API_KEY_1..N`, `OPENROUTER_API_KEY_1..N`). DB는 usage/enabled만. (AGENTS #4·#8)
- 모든 신규 테이블 RLS 동반(admin 전용 read, service_role write).

---

## 4. LLM 키 풀 (번역 패턴 복제)

`src/lib/llm/` 신설, `translate/` 와 동형:
- `providers/{gemini,groq,openrouter}.ts`: 각 `name`, `isConfigured()`(env 키 존재), `monthlyTokenLimit`, `classify(batchPrompt)` 구현. **env에 키가 여러 개**면 모듈이 라운드로빈으로 그중 하나 선택.
- `index.ts`: provider 순회 → enabled & 한도 여유 & configured 인 첫 provider 사용 → 성공 시 `increment_llm_usage` RPC. 전부 실패/소진 → `null` 반환(호출부는 결정적 폴백).
- 라우팅: provider 순서 = [gemini, groq, openrouter](비용·품질·한도 균형). 같은 provider 내 키 N개는 사용량 적은 키 우선.

---

## 5. 토큰 최적화 (필수)

1. **계층형**: dedup + 결정적 키워드그룹 매칭으로 명백한 통과/탈락 선처리 → LLM엔 "애매한 것"만.
2. **배치**: 제목+스니펫 10~20건을 1프롬프트, JSON 배열 응답.
3. **입력 최소**: 분류·태깅엔 제목+스니펫만(풀본문 X). 풀본문 요약은 high importance 소수만.
4. **출력 최소**: 라벨을 enum 인덱스/짧은 코드로, 설명 금지·JSON only.
5. **시스템 프롬프트 캐싱**: 분류기준·태그사전·키워드그룹을 고정 시스템 프롬프트로(지원 모델 prompt caching).
6. **trust_tier 면제**: 신뢰 소스는 LLM 스킵, 결정적 점수만.

---

## 6. 3축 태그 + 시그널

- **태그 3축**(David §4 채택): tag_type = `industry`(산업) / `company`(기업·기관) / `tech`(기술) / `market`(시장) / `policy`(정책) + `content_type`(소스타입 자동). 기사당 **최대 5개**.
- **부여 5단계 캐스케이드**: ① 소스타입 태그(자동) → ② 기업/기관명(keyword_groups company 매칭) → ③ 기술 태그(keyword_group 매칭) → ④ LLM 보조 태그(애매·요약 기반) → ⑤ 관리자 표준 병합.
- **signal_type enum 초안(확정 필요)**: `경쟁사동향`, `규제·정부`, `신제품·출시`, `투자·M&A`, `기술트렌드`, `시장지표`, `파트너십`, `인사·조직`.
- `content_signals` 집계 뷰(시그널×서비스×기간) → signal-insight 화면/AI보고서 토대.

---

## 7. keyword_groups 시드 (David 확정 — 16그룹, LG U+ 서비스라인 정렬)

| kind | 그룹 | 키워드 예시(include) | 노출 태그타입 |
|---|---|---|---|
| competitor | 경쟁사 | SKT, KT, SK브로드밴드, 세종텔레콤, 네이버클라우드, 카카오엔터프라이즈, NHN Cloud | company |
| bigtech | 빅테크 | AWS, Microsoft, Azure, Google Cloud, Oracle, NVIDIA, OpenAI, Salesforce, ServiceNow | company |
| ai_tech | AI 기술 | 생성형 AI, AI Agent, Enterprise AI, Copilot, LLM, RAG, sovereign AI, AI 인프라 | tech |
| aicc | AICC | AI 컨택센터, AICC, 콜센터 AI, 상담봇, 음성봇, STT, TTS | tech |
| aidc | AIDC(데이터센터) | 데이터센터, AI 데이터센터, IDC, GPU 클라우드, 코로케이션, 냉각·전력 | tech |
| telecom_b2b | 통신 B2B | 5G 특화망, Private 5G, 네트워크 슬라이싱, MEC, 전용회선, IoT, M2M | industry |
| mobility | 모빌리티 | 차량관제, 커넥티드카, V2X, 물류, 자율주행, 텔레매틱스 | industry |
| cctv | CCTV·영상보안 | CCTV, 영상관제, 지능형 관제, VMS, 영상분석 | industry |
| sme_solution | SME 솔루션 | 소상공인, 중소기업 솔루션, POS, 기업솔루션, SaaS 구독 | industry |
| physical_ai | 피지컬 AI | 피지컬 AI, 로봇, 휴머노이드, 임베디드 AI, 엣지 AI | tech |
| gov_reg | 정부 규제 | AI 기본법, 개인정보보호법, 클라우드보안인증(CSAP), 망 이용대가, 전파법 | policy |
| gov_business | 정부 사업 | 공공 SaaS, 디지털플랫폼정부, 사업공고, 조달, 국가 R&D, 실증사업 | policy |
| manufacturing_dx | 제조 DX | 스마트팩토리, MES, OT 보안, 예지보전, 디지털 트윈, 산업 AI | industry |
| it_trend | IT 동향 | 클라우드, SaaS, 사이버보안, 데이터, DX, 플랫폼 | industry |
| energy | 에너지 | RE100, PPA, VPP, REC, 전력, 재생에너지 | industry |
| esg | ESG | ESG, 탄소배출, Scope 3, 지속가능경영, 탄소중립 | industry |

- 노이즈 방지: "AI" 단독 금지 → `enterprise AI`·`AI agent`·`sovereign AI` 같은 **조합 키워드**를 include_patterns에. exclude_patterns엔 49 연예/스포츠/부동산 패턴 흡수.
- 시드의 키워드 예시는 출발점 — 운영하며 어드민에서 확장(keyword_groups 편집).

### 키워드그룹/태그가 어디에 쓰이나 (노출 지점)
keyword_groups **정의**는 어드민 내부 설정(사용자 비노출). **매칭 결과**가 3役:
1. **내부**: 관련도 점수(include↑/exclude↓)로 게이팅(불필요 차단), 시그널 분류 토대.
2. **노출**: 기사 카드/상세 **해시태그**(#경쟁사·#AICC…).
3. **검색·필터 facet**: 사용자가 태그·기업·기관으로 탐색(화면설계 §10).

---

## 8. 지시서 슬라이스 (제안)

1. **B1 — keyword_groups + 가중 관련도 + 게이트 ON** *(LLM 없음, 결정적·즉시 효과)*
   - `keyword_groups` 스키마+시드(SQL 핸드오프), `relatednessScore` 이진→연속(제목 가중↑·본문↓·매칭수·exclude 차감), 49 EXCLUDE를 keyword_groups.exclude로 흡수, `RELATEDNESS_GATING_ENABLED=true`+승인 큐, `importance_score` 적재.
2. **B2 — LLM 게이트웨이** *(인프라)*: `src/lib/llm/` 풀·라우팅·`llm_usage`/`llm_settings`·폴백. 호출부는 스텁.
3. **B3 — 3축 태그 + tagContent 재작성**: keywords.tag_type/normalized_name, 5단계 캐스케이드, LLM 배치 분류 연결(B2 사용).
4. **B4 — signal_type + content_signals + 집계 뷰**: signal-insight 토대.
5. **B5 — 번역 정책 고도화**(선택): 중요도 티어(high=DeepL/low=LLM풀), `translation_status`, 한도 lock UI(개선안 §4).

권장 착수: **B1**(결정적, LLM 의존 없이 양질 즉시 향상) → B2 → B3 → B4 → B5.

---

## 9. 확정 필요 (지시서화 전)
1. `signal_type` 최종 목록(§6 초안 확정?).
2. ~~keyword_groups kind·시드~~ → **확정(§7 16그룹)**.
   게이트 threshold=0.3 시작 + `sources.trust_tier` 신뢰소스 면제 → **확정(Opus 판단 위임)**.
3. 태그 저장: **keywords 확장**(권장) vs 신규 `tags`/`item_tags` 테이블.
4. 무료 LLM 키 확보 현황(팀원 키 몇 개·어느 provider) + 각 무료 티어 상업적 사용 ToS 확인.
5. 게이트 threshold 시작값(예: 0.3) + trust_tier 면제 소스 기준.
