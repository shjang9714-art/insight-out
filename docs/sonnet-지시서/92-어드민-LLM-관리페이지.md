# 지시서 92 — 어드민 LLM 관리 페이지(/admin/llm): 현황·연동테스트·사용량 통계·라우팅

> 작성: Opus(Cowork) · 대상: 구현 에이전트(Claude Code) · 검증: Opus · 커밋: 구현 에이전트
> ⚠️ 작업 전 `AGENTS.md` + `docs/LLM-모델-라우팅-관리.md` + `src/app/api/admin/llm-test/route.ts`(현 GET: 현황+라우팅+라이브 호출) + `src/lib/llm/index.ts`(LLM_PROVIDERS·llmComplete) + `supabase/schema.sql`(llm_settings·llm_usage·llm_models·llm_task_routing) + `src/lib/admin/nav.ts`(AI·처리 그룹 'LLM 라우팅' disabled 항목) 를 읽을 것. `npm install` 먼저.
> **DB 변경 없음**(기존 llm_* 테이블, 55에서 적용됨). 단독 커밋.

---

## 배경 (David)
어드민에 LLM 라우팅 기능이 노출 안 됨(네비 "예정" 비활성, `/admin/llm` 없음). **연동 테스트·사용량/호출수 통계·라우팅 현황**을 어드민에서 보게 한다. ⚠️ **키 부족 상황** — 데이터 조회는 LLM 호출 0, 테스트는 버튼 눌렀을 때만 1회.

## 작업

### 1. 데이터 조회 API (LLM 호출 없음) — `GET /api/admin/llm`
- 신규 `src/app/api/admin/llm/route.ts`. admin 게이트(llm-test 패턴 미러).
- service_role(admin client)로 조회·반환:
  - `providers`: `LLM_PROVIDERS` 각 provider의 `{ name, configured: isConfigured(), enabled(llm_settings), monthly_token_limit, usage: {tokens, calls}(llm_usage 이번 달 period 'YYYY-MM' KST) }`.
  - `routing`: `llm_task_routing` 전체(`task_type, priority, provider, model_id, is_active`) task·priority 순.
  - `models`: `llm_models`(`provider, model_id, label, is_active`) — 라우팅 표시용.
- **라이브 LLM 호출 절대 안 함**(페이지 로드마다 키 소모 방지).

### 2. 연동 테스트 — 버튼 전용 (호출 1회)
- 기존 `GET /api/admin/llm-test`(라이브 `llmComplete` 호출 포함)를 **테스트 버튼 액션**으로만 사용. 페이지 로드엔 쓰지 않음.
- (선택) task 선택 파라미터(`?task=classify|summarize|report`)로 어떤 라우팅을 테스트할지 — 기본 classify(가장 가벼움). 무리하면 classify 고정.

### 3. provider 설정 토글 — `PATCH /api/admin/llm`
- body `{ provider, enabled?, monthly_token_limit? }` → `llm_settings` 업데이트(admin). 키 값은 다루지 않음(#8, env 전용).
- (라우팅 항목 is_active 토글·우선순위 편집은 **v2** — 이번엔 표시만.)

### 4. 화면 — `src/app/admin/llm/page.tsx` + 클라이언트 매니저
- `/admin/llm` 서버 페이지(헤더) + `LlmManager`(`'use client'`, GET /api/admin/llm 로드).
- **① Provider 현황 카드**: provider별 — configured(키 등록) 배지(O/X)·enabled 토글·이번 달 tokens/calls·월 한도 대비 사용률 바. configured=false 면 "env 키 미등록" 강조(David 키 부족 진단).
- **② 사용량 통계**: 이번 달 provider별 tokens·calls 합계 + 막대(Recharts, 74에서 도입). (기간은 이번 달 고정, 추이는 후속.)
- **③ 용도별 라우팅 표**: task_type(classify/summarize/report)별 priority 순 provider·model·활성 여부. 읽기 전용(v1).
- **④ 연동 테스트 버튼**: 누르면 `/api/admin/llm-test` 호출 → 성공/실패·사용 provider·응답 일부 표시. "호출 1회 소모" 안내.
- 빈/에러 상태·로딩 한국어.

### 5. 네비 활성화 — `src/lib/admin/nav.ts`
- AI·처리 그룹의 'LLM 라우팅' 항목에서 `disabled`/`badge:'예정'` 제거, `href: '/admin/llm'` 로 활성화. (라벨 'LLM 라우팅' 유지 또는 'LLM 관리'.)

## 회귀 / 주의
- **페이지 로드 시 LLM 호출 0** — 통계·현황은 DB만. 테스트는 버튼 명시적 1회(키 부족 보호).
- 키 값 노출·저장 금지(#8) — configured(boolean)만. 키는 Vercel env.
- llm_* 테이블 admin RLS 통과(쿠키/서비스). UI 한국어(#1)·토큰 색(#9)·`'use client'` 매니저만(#12).
- llm_task_routing 비어있어도(폴백 동작) 표는 빈 상태로.

## 완료 조건
- [ ] `GET /api/admin/llm`(현황+라우팅+모델, LLM 호출 0) + `PATCH`(provider enabled/limit)
- [ ] `/admin/llm` 페이지: provider 현황·enabled 토글·사용량 통계(막대)·라우팅 표·연동 테스트 버튼
- [ ] 네비 'LLM 라우팅' 활성화(disabled 제거)
- [ ] `npx tsc --noEmit` · `npm run build` · `npm run lint`(신규 0) 통과
- [ ] 육안: 현황·사용량 표시(호출 0), 테스트 버튼만 호출 1회, provider 토글 반영

## 보고 양식
```
## 완료 보고 — 지시서 92 어드민 LLM 관리 페이지
- 신규/변경: api/admin/llm(route GET·PATCH), admin/llm/page.tsx + LlmManager, nav.ts(활성화)
- 조회=LLM호출0 · 테스트=버튼1회 · provider 토글 · 사용량 통계 · 라우팅 표
- DB 무변경 · 검증: tsc · build · lint(신규 0) · 육안
- 미해결: 라우팅 편집(우선순위·is_active, v2) · 사용량 추이(월별, 후속)
```

---

### 메모(후속)
- v2: 라우팅 표 인라인 편집(우선순위·provider·model·is_active), 모델 카탈로그 CRUD.
- 사용량 월별 추이 차트.
- 관련: 설계 `docs/LLM-모델-라우팅-관리.md`, 지시서 54·55(LLM 인프라).
