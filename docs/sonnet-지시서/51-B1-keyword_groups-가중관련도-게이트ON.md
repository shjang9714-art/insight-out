# 지시서 51 (묶음 B-1) — keyword_groups + 가중 관련도 + 게이트 ON

> 작성: Opus(Cowork) · 대상: 구현 에이전트(Claude Code) · 검증: Opus · 커밋: 구현 에이전트
> ⚠️ 작업 전 `AGENTS.md` + `docs/묶음B-LLM양질엔진-설계.md`(§1·§2·§7) + `src/lib/crawler/quality.ts` + `src/lib/crawler/orchestrator.ts`(runCrawl 키워드 로드 L516~527·crawlOne 품질·게이트 L288~330) + `supabase/schema.sql`(sources·contents) 를 읽을 것. `npm install` 먼저.
> **DB 변경 있음 → 수희 SQL 핸드오프 동반**(A절 먼저 커밋·푸시). B1은 ALTER TYPE ADD VALUE 가 없어 **단일 트랜잭션 가능**(50과 달리 STEP 분리 불필요).
> **LLM 없음** — 전부 결정적 코드. LLM 게이트웨이는 B2(다음).

---

## 배경 / 목표

근거: `docs/묶음B-LLM양질엔진-설계.md`. 현재 관련도=이진(`relatednessScore` includes 1.0/0.0), 게이트 OFF, EXCLUDE는 49의 하드코딩 4패턴.

B1은 **결정적 양질 엔진의 바닥**을 깐다:
1. `keyword_groups`(16그룹) 신설 — include/exclude/weight. 관련도·차단·(후속)태그·시그널의 공통 토대.
2. `relatednessScore` 이진 → **가중 연속값**(제목 가중↑·본문↓·매칭수·그룹 weight).
3. 49의 EXCLUDE 하드코딩 → **keyword_groups.exclude_patterns로 이전**(DB 관리).
4. **게이트 ON**(`RELATEDNESS_GATING_ENABLED=true`) — threshold 미만은 `pending`(어드민 승인 큐 `/admin/contents` 기존). **`trust_tier` 높은 신뢰 소스는 면제**.
5. `contents.importance_score` 적재(연속 관련도 = 시작값. 최신성·신뢰도 가중·insight_score는 후속).

설계 원칙: 키 없이 결정적으로 동작, 양질 즉시 향상. 태그 부여(`tagContent`) 재작성은 **B3**이라 이번엔 건드리지 않음(기존 keywords 기반 tagContent 유지).

---

## A절. SQL 핸드오프 (`docs/sql-handoff/51-keyword_groups.sql`) — 먼저 커밋·푸시

단일 트랜잭션 OK. RLS 필수(AGENTS #7).

```sql
-- 1) 태그 타입 enum (B1: keyword_groups.tag_type 용. B3에서 keywords에도 사용)
create type tag_type as enum ('industry','company','tech','market','policy','content_type');

-- 2) keyword_groups
create table public.keyword_groups (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,                 -- 표시명 (예: 경쟁사)
  kind             text not null,                 -- slug (예: competitor) — admin 추가 자유(enum 아님)
  tag_type         tag_type not null default 'industry',
  description      text,
  include_patterns text[] not null default '{}',  -- 매칭(점수↑·태그)
  exclude_patterns text[] not null default '{}',  -- 매칭 시 도메인무관 하드 reject
  weight           numeric not null default 1.0,
  signal_hint      text,                          -- (B4 연계용, nullable)
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger set_keyword_groups_updated_at
  before update on public.keyword_groups
  for each row execute function public.set_updated_at();

alter table public.keyword_groups enable row level security;
-- 읽기: 인증 사용자(태그/필터 노출). 쓰기: admin 만.
create policy "keyword_groups: 인증 조회" on public.keyword_groups
  for select using (auth.uid() is not null);
create policy "keyword_groups: admin 전체" on public.keyword_groups
  for all using (public.is_admin()) with check (public.is_admin());

-- 3) sources.trust_tier (0=광역/엄격, 1=기본, 2=신뢰/게이트면제)
alter table public.sources
  add column trust_tier smallint not null default 1;

-- 4) contents.importance_score (0~1, 결정적 관련도 시작값)
alter table public.contents
  add column importance_score numeric not null default 0;

-- 5) 16그룹 시드 (include/exclude/weight/tag_type) — 설계 §7
--    예시는 출발점. exclude 에 49 노이즈 패턴 흡수(연예/스포츠/부동산/운세).
insert into public.keyword_groups (name, kind, tag_type, include_patterns, weight) values
 ('경쟁사','competitor','company', array['SKT','KT','SK브로드밴드','세종텔레콤','네이버클라우드','카카오엔터프라이즈','NHN Cloud'], 1.2),
 ('빅테크','bigtech','company', array['AWS','Microsoft','Azure','Google Cloud','Oracle','NVIDIA','OpenAI','Salesforce','ServiceNow'], 1.0),
 ('AI 기술','ai_tech','tech', array['생성형 AI','AI Agent','Enterprise AI','Copilot','LLM','RAG','sovereign AI','AI 인프라'], 1.0),
 ('AICC','aicc','tech', array['AI 컨택센터','AICC','콜센터 AI','상담봇','음성봇'], 1.1),
 ('AIDC','aidc','tech', array['데이터센터','AI 데이터센터','IDC','GPU 클라우드','코로케이션'], 1.1),
 ('통신 B2B','telecom_b2b','industry', array['5G 특화망','Private 5G','네트워크 슬라이싱','MEC','전용회선','M2M'], 1.1),
 ('모빌리티','mobility','industry', array['차량관제','커넥티드카','V2X','자율주행','텔레매틱스'], 1.0),
 ('CCTV·영상보안','cctv','industry', array['CCTV','영상관제','지능형 관제','VMS','영상분석'], 1.0),
 ('SME 솔루션','sme_solution','industry', array['소상공인','중소기업 솔루션','POS','기업솔루션','SaaS 구독'], 1.0),
 ('피지컬 AI','physical_ai','tech', array['피지컬 AI','로봇','휴머노이드','임베디드 AI','엣지 AI'], 0.9),
 ('정부 규제','gov_reg','policy', array['AI 기본법','개인정보보호법','클라우드보안인증','망 이용대가','전파법'], 1.0),
 ('정부 사업','gov_business','policy', array['공공 SaaS','디지털플랫폼정부','사업공고','조달','국가 R&D','실증사업'], 1.0),
 ('제조 DX','manufacturing_dx','industry', array['스마트팩토리','MES','OT 보안','예지보전','디지털 트윈','산업 AI'], 1.0),
 ('IT 동향','it_trend','industry', array['클라우드','SaaS','사이버보안','DX','플랫폼'], 0.8),
 ('에너지','energy','industry', array['RE100','PPA','VPP','REC','재생에너지'], 0.8),
 ('ESG','esg','industry', array['ESG','탄소배출','Scope 3','지속가능경영','탄소중립'], 0.8);

-- 노이즈 제외 그룹(점수 0·is_active, 도메인무관 하드 reject 전용)
insert into public.keyword_groups (name, kind, tag_type, weight, exclude_patterns) values
 ('노이즈 제외','_noise','industry', 0,
  array['연예','아이돌','걸그룹','보이그룹','열애설','프로야구','KBO','프로축구단 후원','K리그','골프 대회','아파트 분양','청약 경쟁률','전세사기','오늘의 운세','로또','복권 당첨','주간 날씨']);
-- ※ 49의 정규식 패턴을 단순 부분일치 문자열로 옮김. '프로축구(?!단)' 의도는 '프로축구단 후원'을 제외 목록에서 빼는 방식이 아니라,
--   exclude는 부분일치라 '프로축구' 대신 더 구체적 문자열을 쓸 것(아래 코드 매칭 규칙 참고). 운영 보며 어드민에서 조정.
```

> exclude 매칭은 **부분일치**라 49의 negative-lookahead(`프로축구(?!단)`)를 그대로 못 옮긴다. 대안: 코드에서 exclude는 제목에만 적용 + 짧은 단어 대신 구체 문자열 사용(위 시드처럼 '프로축구단 후원'은 *제외 패턴에 넣지 않음*). 오탐 시 어드민에서 패턴 조정.

## B절. 코드 (검증 통과 후 커밋)

### 1. `supabase/schema.sql` (SSOT)
- `tag_type` enum, `keyword_groups` 테이블+RLS+트리거, `sources.trust_tier`, `contents.importance_score` 최종 상태 반영. (시드는 핸드오프 파일로 충분 — schema.sql 시드 섹션 관례 따르면 포함, 아니면 생략하고 주석)

### 2. `src/lib/types.ts`
- `TagType` 타입, `KeywordGroup` 인터페이스, `Source.trust_tier: number`, `Content.importance_score: number` 추가.

### 3. `src/lib/crawler/quality.ts` — 가중 관련도 + 그룹 exclude
- `RELATEDNESS_GATING_ENABLED = true` 로 변경.
- 49의 `EXCLUDE_TITLE_PATTERNS`/`isExcludedTitle` **제거**(노이즈는 이제 keyword_groups.exclude).
- 신규 타입(경량): `interface ScoringGroup { include_patterns: string[]; exclude_patterns: string[]; weight: number }`.
- `isExcludedByGroups(title: string, groups: ScoringGroup[]): boolean` — 어느 그룹의 exclude_patterns(부분일치, **제목만**)라도 걸리면 true.
- `relatednessScore(title, body, groups): number` 재작성(0~1 연속):
  ```ts
  const RELATEDNESS_CAP = 3   // 정규화 상수(튜닝 가능)
  // 그룹별: 제목 매칭 ×2, 본문 매칭 ×1, 그룹 weight 곱. 합산 후 cap 정규화.
  let total = 0
  for (const g of groups) {
    if (g.weight <= 0) continue            // 노이즈 그룹(weight 0) 점수 제외
    const t = g.include_patterns.filter(p => titleLower.includes(p.toLowerCase())).length
    const b = g.include_patterns.filter(p => bodyLower.includes(p.toLowerCase())).length
    if (t + b > 0) total += g.weight * (t * 2 + b)
  }
  return Math.min(total / RELATEDNESS_CAP, 1)
  ```
- `RELATEDNESS_THRESHOLD = 0.3` 유지.

### 4. `src/lib/crawler/orchestrator.ts`
- `runCrawl`: 기존 keywords 로드와 함께 **`keyword_groups`(is_active) 로드** 추가(Promise.all). `crawlOne`에 groups 전달.
- `crawlOne` 품질/게이트 단계 수정:
  - **단계1(reject)**: 기존 `isAdLike(qText) || effectiveLength<MIN` 에 더해 `isExcludedByGroups(item.title, groups)` OR 추가(49 대체). reject++.
  - **게이트**: `const score = relatednessScore(item.title, item.body ?? '', groups)`.
    `const importance = score`.
    `const exempt = source.trust_tier >= 2`.
    `const contentStatus = (!exempt && score < RELATEDNESS_THRESHOLD) ? 'pending' : 'published'`.
    (`RELATEDNESS_GATING_ENABLED` 가 true이므로 실제 보류 발생.)
  - row 에 `importance_score: importance` 추가.
- `tagContent`(keywords 기반)는 **그대로 유지**(B3에서 재작성). keywords 로드도 유지.
- `Source` 타입에 trust_tier 포함되므로 `source.trust_tier` 접근 OK(없으면 default 1 — DB not null default).

### 5. (이번 범위 아님, 명시)
- keyword_groups **어드민 편집 UI** → 후속(52 또는 별도). B1은 시드로 충분.
- 태그 부여 재작성·tag_type 활용 → B3.

---

## 회귀 / 주의
- 게이트 ON 으로 **정상 기사가 과다 pending 되지 않는지** 확인이 핵심. 시드 커버리지 + threshold 0.3 + trust_tier 면제로 완화. 수집 후 `/admin/contents` 보류 큐 양 점검(검증 시).
- 49의 EXCLUDE 거동이 keyword_groups.exclude로 동등 이상인지(연예/스포츠/부동산/운세 제목 제외 유지). '프로축구단 후원' 같은 정상 기사가 제외 안 되는지(시드에서 '프로축구' 단독 미포함).
- 번역·dedup·near-dup cluster 로직 무변경.
- 신규 테이블 RLS 적용 확인(비admin 쓰기 차단, 인증 읽기 허용).

## 완료 조건
- [ ] `docs/sql-handoff/51-keyword_groups.sql`(테이블+RLS+trust_tier+importance_score+16그룹+노이즈 시드) — 먼저 커밋·푸시
- [ ] schema.sql 최종 반영
- [ ] types.ts(TagType·KeywordGroup·trust_tier·importance_score)
- [ ] quality.ts(게이트 ON·그룹 exclude·가중 relatednessScore, 49 하드코딩 제거)
- [ ] orchestrator(keyword_groups 로드·게이트·trust_tier 면제·importance_score 적재)
- [ ] tagContent 무변경 / 번역·dedup 무변경
- [ ] 간단 검증: 샘플 제목·본문 + 시드 그룹으로 relatednessScore/isExcludedByGroups 출력 확인(임시 스크립트, 영구 테스트 파일 X)
      - 관련(예: "KT, Private 5G 특화망 수주") score ≥ 0.3 → published
      - 무관(예: "오늘의 운세") → exclude reject
- [ ] `npx tsc --noEmit` · `npm run build` · `npm run lint`(신규 0) 통과
- [ ] (마이그레이션 후) 수집 1회 → 보류 큐 과다 여부 육안

## 보고 양식
```
## 완료 보고 — 지시서 51 (B-1) keyword_groups + 가중관련도 + 게이트 ON
- SQL 핸드오프: docs/sql-handoff/51-keyword_groups.sql — 커밋 <hash>
- 변경 파일: <목록>
- relatednessScore 가중 연속 / 게이트 ON / trust_tier 면제 / importance_score 적재 / 49 EXCLUDE→keyword_groups.exclude 이전
- tagContent·번역·dedup 무변경 확인
- 검증: tsc · build · lint(신규 0) · 샘플 점수/제외 육안 · (마이그레이션 후)보류 큐 점검
- 미해결/관찰: <게이트 ON 후 pending 비율 등>
```

---

### 다음(묶음 B)
- **B2(52)**: LLM 게이트웨이(`src/lib/llm/` 키 풀·라우팅·llm_usage/settings·폴백). 번역 패턴 복제.
- **B3**: 3축 태그(keywords.tag_type/normalized) + tagContent 5단계 캐스케이드 + LLM 배치 분류 연결.
- **B4**: signal_type + content_signals + 집계 뷰.
