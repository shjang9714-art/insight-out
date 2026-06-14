# 지시서 54 (묶음 B-2) — LLM 게이트웨이 / 무료 키 풀

> 작성: Opus(Cowork) · 대상: 구현 에이전트(Claude Code) · 검증: Opus · 커밋: 구현 에이전트
> ⚠️ 작업 전 `AGENTS.md` + `docs/묶음B-LLM양질엔진-설계.md`(§4·§5) + `src/lib/translate/index.ts`(동형 패턴) + `src/lib/translate/types.ts` + `src/lib/translate/providers/deepl.ts`(provider 형태 참고) + `src/app/api/admin/crawl-now/route.ts`(verifyAdmin) 를 읽을 것. `npm install` 먼저.
> **DB 변경 있음 → 수희 SQL 핸드오프**(A절 먼저 커밋·푸시). 단일 트랜잭션(ALTER TYPE ADD VALUE 없음).
> **인프라만** — 실제 분류 프롬프트/호출은 B3. B2는 게이트웨이 + 키 검증 라우트까지.

---

## 배경 / 목표
무료 LLM 키 풀(Gemini·Groq·OpenRouter·Cerebras, 팀원 포함 ~7개)을 **번역 폴백 패턴과 동형**으로 구축. 한 provider/키 소진·장애 시 다음으로 폴백, 전부 소진 시 `null`(호출부는 결정적 폴백). 토큰 절약을 위해 호출부(B3)에서 배치·최소 IO 하되, B2는 범용 `llmComplete(system, user)` 코어만 제공.

**원칙**: 키는 env 전용(commit 금지, AGENTS #4·#8). `.env.example` 동시 갱신(#5). 키는 DB 저장 금지 — DB는 usage/enabled만.

---

## A절. SQL 핸드오프 (`docs/sql-handoff/54-llm-usage.sql`) — 먼저 커밋·푸시

번역의 `translation_usage`/`translation_settings` + `increment_translation_usage` 와 동형.

```sql
-- LLM 사용량(월) — provider 별 토큰·호출 누적
create table public.llm_usage (
  provider   text not null,
  period     text not null,            -- 'YYYY-MM' (KST)
  tokens     bigint not null default 0,
  calls      integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (provider, period)
);

-- LLM 설정 — provider on/off + 월 토큰 한도
create table public.llm_settings (
  provider             text primary key,
  enabled              boolean not null default true,
  monthly_token_limit  bigint not null default 1000000
);

insert into public.llm_settings (provider, enabled, monthly_token_limit) values
 ('gemini', true, 1000000),
 ('groq', true, 1000000),
 ('cerebras', true, 1000000),
 ('openrouter', true, 1000000)
on conflict (provider) do nothing;

-- 사용량 원자적 증가 RPC (increment_translation_usage 참고)
create or replace function public.increment_llm_usage(
  p_provider text, p_period text, p_tokens bigint, p_calls integer
) returns void language sql security definer as $$
  insert into public.llm_usage (provider, period, tokens, calls)
  values (p_provider, p_period, p_tokens, p_calls)
  on conflict (provider, period)
  do update set tokens = public.llm_usage.tokens + excluded.tokens,
                calls  = public.llm_usage.calls  + excluded.calls,
                updated_at = now();
$$;

-- RLS: admin 만 조회(쓰기는 service_role 로 RPC). translation_* RLS 패턴 따를 것.
alter table public.llm_usage    enable row level security;
alter table public.llm_settings enable row level security;
create policy "llm_usage admin"    on public.llm_usage    for select using (public.is_admin());
create policy "llm_settings admin" on public.llm_settings for all using (public.is_admin()) with check (public.is_admin());
```

> `increment_translation_usage` 의 실제 시그니처·security 설정을 먼저 확인해 동일 컨벤션으로 맞출 것(반환형·grant 등).

## B절. 코드 (검증 통과 후 커밋)

### 1. `.env.example` + (`.env.local` 은 David 가 실제 키 입력)
```
# LLM 키 풀 (provider별 콤마구분, 개수 가변). 실제 키는 .env.local / Vercel 환경변수에만.
GEMINI_API_KEYS=
GROQ_API_KEYS=
OPENROUTER_API_KEYS=
CEREBRAS_API_KEYS=
# 모델(미지정 시 코드 기본값). 무료 모델 ID는 변동되니 필요 시 override.
GEMINI_MODEL=
GROQ_MODEL=
OPENROUTER_MODEL=
CEREBRAS_MODEL=
```
- ⚠️ 실제 키 값은 **절대 커밋 금지**. `.env.example` 엔 빈 값만.

### 2. `src/lib/llm/types.ts`
```ts
export interface LlmResult { text: string; tokens: number }
export interface LlmProvider {
  name: string                       // 'gemini' | 'groq' | 'cerebras' | 'openrouter'
  isConfigured(): boolean            // env 키 1개 이상 존재
  complete(system: string, user: string): Promise<LlmResult | null>
}
```

### 3. providers
- **OpenAI 호환(Groq·OpenRouter·Cerebras)**: 공통 팩토리 `openaiCompatProvider({ name, baseURL, keysEnv, model })`.
  - baseURL: Groq `https://api.groq.com/openai/v1`, OpenRouter `https://openrouter.ai/api/v1`, Cerebras `https://api.cerebras.ai/v1`.
  - `chat/completions` 호출(`messages:[{role:'system'},{role:'user'}]`, `temperature:0`, `response_format:{type:'json_object'}` 지원 시). 응답 `usage.total_tokens` 로 tokens.
  - **키 풀**: `process.env[keysEnv]` 콤마 split → 빈 제거 → 호출 시 풀에서 **랜덤 1개**(서버리스 무상태라 라운드로빈 대신 랜덤으로 분산). 실패(401/429) 시 같은 provider 내 다른 키 1회 재시도 후 실패면 null.
  - 기본 모델: Groq `llama-3.3-70b-versatile`, Cerebras `llama-3.3-70b`, OpenRouter `meta-llama/llama-3.3-70b-instruct:free`. env override 우선.
- **Gemini**(`src/lib/llm/providers/gemini.ts`): REST `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key=<KEY>`. 기본 모델 `gemini-2.0-flash`. system 은 `systemInstruction`, user 는 `contents`. `usageMetadata.totalTokenCount` 로 tokens. 키 풀 동일(랜덤).
- ⚠️ 무료 모델 ID 는 변동 가능 — 위 기본값이 현재 유효한지 확인하고, 안 되면 흔한 대체(예: Groq `llama-3.1-8b-instant`, Gemini `gemini-1.5-flash`)로. 보고에 실제 사용 모델 명시.

### 4. `src/lib/llm/index.ts` (라우팅 + 사용량)
- `LLM_PROVIDERS: LlmProvider[]` = [gemini, groq, cerebras, openrouter] (폴백 순서, 튜닝 가능).
- `getKstPeriod()` 는 translate 의 것 재사용/동형('YYYY-MM').
- `export async function llmComplete(system: string, user: string): Promise<string | null>`:
  - `llm_usage`(period) + `llm_settings` 로드(translate 와 동일 구조).
  - provider 순회: `isConfigured()` && enabled && `used.tokens < monthly_token_limit` 인 첫 provider 로 `complete()`.
  - 성공 시 `increment_llm_usage(provider, period, tokens, 1)` RPC → text 반환.
  - 실패/skip 시 다음 provider. 전부 실패 → `null`.
- `'server-only'` import(서버 전용). 키는 서버에서만.

### 5. 키 검증 라우트 `src/app/api/admin/llm-test/route.ts` (GET, admin)
- verifyAdmin(crawl-now 패턴) 후 `llmComplete('You reply with JSON only.', 'Return {"ok":true} as JSON.')` 1회 호출.
- 어느 provider 가 응답했는지 알 수 있게: index 에 디버그용 변형(예: `llmComplete` 가 성공 provider 명을 로그)하거나, 라우트에서 각 provider 의 `isConfigured()` 현황 + 호출 결과(text 앞부분)·사용량을 JSON 으로 반환.
- 목적: **7개 키/4 provider 가 실제로 동작하는지 한 번에 점검**. (어드민 화면 버튼은 선택 — 라우트만으로 충분, 보고에 호출 결과 첨부)

### 6. `supabase/schema.sql`
- `llm_usage`, `llm_settings`, `increment_llm_usage`, RLS 최종 반영.

---

## 회귀 / 주의
- 기존 번역 시스템 무변경(별개). 크롤러·게이트(51) 무변경 — B2는 호출되는 곳이 아직 없음(테스트 라우트 제외). 즉 **프로덕션 동작 영향 없음**, 순수 신규 인프라.
- 키 미설정(env 빈 값)이어도 빌드·기존 기능 정상(provider isConfigured()=false → llmComplete=null). 안전.
- 키 절대 커밋 금지(.env.example 빈 값만). `response_format` 미지원 모델 대비: 실패 시 일반 호출로 폴백하거나 프롬프트로 JSON 강제(B3에서 정교화).
- 무료 티어 rate limit(429) 흔함 → 같은 provider 다른 키 1회 재시도 + provider 폴백으로 완화.

## 완료 조건
- [ ] `docs/sql-handoff/54-llm-usage.sql`(테이블 2 + RPC + RLS + seed) — 먼저 커밋·푸시
- [ ] schema.sql 반영
- [ ] `.env.example` 키/모델 변수(빈 값) 추가
- [ ] `src/lib/llm/` types + providers(gemini + openai호환 3) + index(llmComplete 라우팅·사용량)
- [ ] `/api/admin/llm-test` 라우트
- [ ] 키 커밋 안 됨 확인 / `'server-only'`
- [ ] `npx tsc --noEmit` · `npm run build` · `npm run lint`(신규 0) 통과
- [ ] (David 가 .env.local/Vercel 에 키 입력 후) `/api/admin/llm-test` 로 provider 응답 확인 — 보고에 어느 provider 동작했는지 첨부

## 보고 양식
```
## 완료 보고 — 지시서 54 (B-2) LLM 게이트웨이 키풀
- SQL 핸드오프: docs/sql-handoff/54-llm-usage.sql — 커밋 <hash>
- 변경 파일: <목록>
- providers: gemini(REST) + groq/cerebras/openrouter(OpenAI호환 팩토리). 사용 모델: <실제>
- index: llmComplete 폴백 순서 [gemini,groq,cerebras,openrouter] + llm_usage 한도 skip
- 키: env 콤마풀(랜덤), 커밋 안 됨 확인
- /api/admin/llm-test: <키 입력 후 응답 결과 / 미입력이면 isConfigured 현황>
- 검증: tsc · build · lint(신규 0)
- 미해결: <모델 ID 등>
```

---

### 다음(B3)
- `classifyBatch(items[])` — 제목+스니펫 N건 묶음 → llmComplete(system=태그사전/keyword_groups, user=배치 JSON) → 관련도·태그·시그널 동시 분류. 5단계 캐스케이드의 ④ LLM 보조. tagContent 재작성 + content_tags/3축.
- David 액션: Vercel/.env.local 에 `*_API_KEYS` 입력(팀원 키 콤마로).
