# 지시서 57 (묶음 B-3a) — keyword_groups 매칭 해시태그 (그룹명 + 구체 키워드)

> 작성: Opus(Cowork) · 대상: 구현 에이전트(Claude Code) · 검증: Opus · 커밋: 구현 에이전트
> ⚠️ 작업 전 `AGENTS.md` + `src/lib/crawler/quality.ts`(relatednessScore·ScoringGroup) + `src/lib/crawler/orchestrator.ts`(processCrawlItem·runCrawl groups 로드 L652) + `src/lib/contents/excerpt.ts`(tagsOf) + `src/components/dashboard/RecentFeed.tsx` + 해시태그를 렌더하는 다른 피드/카드 + `supabase/schema.sql` 를 읽을 것. `npm install` 먼저.
> **DB 변경 있음 → 수희 SQL 핸드오프**(A절 먼저). 단일 ALTER, 단일 트랜잭션.
> **LLM 무관** — 결정적. keyword_groups(이미 게이트가 매칭 중)의 매칭 결과를 저장·표시만.

---

## 배경 / 문제
지금 카드 해시태그는 `tagsOf(매칭키워드, category, services)` 인데(`excerpt.ts`), **매칭 키워드가 0개면 category 로 폴백** → 대부분 기사가 "#뉴스"(=사실상 태그 없음)로 보임. 정보가치 없음(David 지적).

원인: 우리가 관리하는 16개 `keyword_groups` 가 **게이트(관련도)엔 쓰이지만 태깅엔 안 쓰임**. 게이트가 이미 그룹별 매칭을 계산하므로, 그 결과만 저장하면 됨.

## 목표
기사에 **① 매칭된 그룹명(#경쟁사 #AICC)** + **② 실제 히트한 키워드(#KT #Private5G)** 를 둘 다 해시태그로. 결정적, 게이트 매칭 재사용.

---

## A절. SQL 핸드오프 (`docs/sql-handoff/57-tag-columns.sql`) — 먼저 커밋·푸시
```sql
alter table public.contents
  add column if not exists matched_groups   text[] not null default '{}',
  add column if not exists matched_keywords text[] not null default '{}';
-- (선택) 배열 필터 대비 GIN 인덱스
create index if not exists contents_matched_groups_idx   on public.contents using gin (matched_groups);
create index if not exists contents_matched_keywords_idx on public.contents using gin (matched_keywords);
```
> 기존 행은 `'{}'`(빈 배열) → 표시 시 category 폴백 유지. 신규 수집분부터 태그 채워짐. (기존분 일괄 채우기는 §B-5 선택 백필.)

## B절. 코드 (검증 통과 후 커밋)

### 1. `ScoringGroup` 에 name 추가 + 로드
- `src/lib/crawler/quality.ts` `ScoringGroup` 에 `name: string` 추가.
- `orchestrator.ts` runCrawl groups 쿼리(L652): `.select('name, include_patterns, exclude_patterns, weight')` (name 은 keyword_groups 기존 컬럼 — 안전). map 에 `name: r.name` 포함. `KeywordGroupRow` 에도 name.
- crawlKeywordSearch 등 groups 사용처 동일.

### 2. `quality.ts` — 매칭 추출 함수
```ts
export interface KeywordMatch { groups: string[]; keywords: string[] }
const MAX_TAG_KEYWORDS = 8

/** keyword_groups include_patterns 매칭 → 그룹명 + 히트 키워드(중복제거·상한). 제목+본문 대상. */
export function matchKeywordGroups(title: string, body: string, groups: ScoringGroup[]): KeywordMatch {
  const text = `${title} ${body}`.toLowerCase()
  const groupSet = new Set<string>()
  const kwSet = new Set<string>()
  for (const g of groups) {
    if (g.weight <= 0) continue  // 노이즈 그룹 제외
    let hit = false
    for (const p of g.include_patterns) {
      if (text.includes(p.toLowerCase())) { kwSet.add(p); hit = true }
    }
    if (hit) groupSet.add(g.name)
  }
  return {
    groups: [...groupSet],
    keywords: [...kwSet].slice(0, MAX_TAG_KEYWORDS),
  }
}
```

### 3. `processCrawlItem` 적재 — **post-insert update(try/catch)로 resilient하게**
- ⚠️ matched_* 를 **insert row 에 직접 넣지 말 것**(컬럼 미존재 시 insert 자체 실패 → 신규 기사 0건 사고). 대신 **insert 성공 후 별도 update**, `tagContent` 와 동일하게 try/catch 로 감싼다(컬럼 없으면 update만 조용히 실패, 기사 적재는 정상).
- 신규 insert 성공(newId 확보) 블록에서:
  ```ts
  const match = matchKeywordGroups(item.title, item.body ?? '', groups)
  try {
    await admin.from('contents')
      .update({ matched_groups: match.groups, matched_keywords: match.keywords })
      .eq('id', newId)
  } catch (e) {
    console.error('[크롤러] 매칭 태그 적재 실패(컬럼 미적용 가능):', e)
  }
  // 기존 tagContent(newId, …) 호출은 유지
  ```
  (Supabase 클라이언트는 보통 {error} 반환이라, error 도 위처럼 로그만 하고 무시 — insert 결과에 영향 없게.)
- 게이트의 relatednessScore 와 동일 매칭이라 결과 일관. LLM 없음.

### 4. 표시 — 그룹 + 키워드 둘 다 해시태그
- `excerpt.ts` `tagsOf` 를 확장(또는 신규):
  ```ts
  // 우선순위: 매칭 그룹 → 매칭 키워드 → (둘 다 없으면) category. 총 상한 6.
  export function tagsOf2(matchedGroups: string[], matchedKeywords: string[], category: string): string[] {
    const tags = [...new Set([...matchedGroups, ...matchedKeywords])]
    return (tags.length ? tags : [category]).slice(0, 6)
  }
  ```
  (기존 `tagsOf` 호출부와 충돌 없게 신규 함수 권장. services 는 더 이상 태그로 안 씀.)
- **해시태그를 렌더하는 모든 피드/카드** 갱신: contents select 에 `matched_groups, matched_keywords` 추가 → `tagsOf2(...)` 결과를 `keywords` prop 으로 전달. 대상(grep `tagsOf`·`content_keywords(`·`keywords={`): `RecentFeed.tsx`, 그리고 `ContentRow`/`ContentListCard`/검색결과/`dashboard/contents/[id]` 등 동일 패턴 전부.
- (선택) 그룹 태그와 키워드 태그를 색으로 구분(그룹=brand, 키워드=muted) — 과하면 동일 스타일로.

### 5. (선택) 기존 published 콘텐츠 백필
- 기존 기사도 태그 보이게 하려면 1회 백필: 서버 스크립트나 admin 라우트에서 `published` 콘텐츠를 keyword_groups 로 재매칭해 matched_* 갱신. 분량 많으면 배치.
- 과하면 생략(신규 수집분부터 적용 — 보고에 명시). 권장: 가벼운 1회 admin 라우트.

### 6. `supabase/schema.sql` 반영(컬럼 2 + 인덱스).

---

## 회귀 / 주의
- 게이트/관련도(relatednessScore)·번역·dedup 무변경. matchKeywordGroups 는 표시용 부가.
- SQL 미적용(matched_* 컬럼 없음)이어도 **insert 안 깨짐**: matched_* 는 post-insert update(try/catch)라 컬럼 없으면 그 update만 skip, 기사 적재·게이트·기존 태깅 정상(49/51/55/56 과 동일 graceful 원칙). SQL 적용되면 그때부터 태그 채워짐.
- 표시: matched_* 가 빈 기존 기사 → category 폴백 그대로(깨지지 않음).
- 태그 상한(그룹+키워드 합 6) 지켜 카드 과밀 방지.

## 완료 조건
- [ ] `docs/sql-handoff/57-tag-columns.sql`(matched_groups·matched_keywords + GIN) — 먼저 커밋·푸시
- [ ] schema.sql 반영
- [ ] ScoringGroup.name + groups 쿼리 name 포함
- [ ] quality.ts matchKeywordGroups
- [ ] processCrawlItem 가 matched_groups·matched_keywords 적재
- [ ] tagsOf2(그룹+키워드, category 폴백) + 모든 해시태그 피드/카드 갱신
- [ ] (선택) 백필
- [ ] `npx tsc --noEmit` · `npm run build` · `npm run lint`(신규 0) 통과
- [ ] 육안(마이그레이션 후 수집 1회): 카드에 #경쟁사 #AICC #KT 식 태그, "#뉴스" 폴백은 무태그 기사만

## 보고 양식
```
## 완료 보고 — 지시서 57 (B-3a) keyword_groups 해시태그
- SQL 핸드오프: docs/sql-handoff/57-tag-columns.sql — 커밋 <hash> (post-insert update라 SQL 선적용 불필요·미적용 시 태그만 skip)
- 변경 파일: <목록 — 피드/카드 갱신 범위 포함>
- matchKeywordGroups(그룹명+히트키워드) / processCrawlItem 적재 / tagsOf2 + 피드 N곳
- 백필: 적용/생략
- 검증: tsc · build · lint(신규 0) · (마이그레이션 후) 태그 육안
- 미해결: <있으면>
```

---

### 다음
- B3 본체: LLM 보조 태그(애매한 기사 의미태그)·시그널 분류·요약 — 키 활성 후.
- 태그를 검색/필터 facet 으로(대시보드 필터에 그룹·키워드 태그) — 후속.
