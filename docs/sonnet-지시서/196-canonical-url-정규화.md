# 지시서 196 — canonical URL 정규화(C-2): 구글뉴스 리다이렉트 해소 저장 + 교차중복 클러스터 병합

> 작성: Opus(Cowork) · 2026-07-05 · 레인: 양질 콘텐츠 수집 체계(트랙 B)
> 근거: 서로 다른 구글뉴스 리다이렉트 URL이 같은 원문을 가리켜도 `original_url` 정확일치 dedup을 통과 → **교차중복 적재**. 해소된 원문 URL을 canonical로 저장해 중복을 묶고(197 near-dup의 토대), 원문링크 무결성을 강화한다.
> 협업 루프: 로컬(커밋X). David 위임 → 구현 → Opus 검증 → "커밋". **SQL 핸드오프 1건(`196-canonical-url.sql`). LLM 없음. 크롤 삽입 hot-path 무변경(추가 fetch 없음).**
> 선행: 66(resolve-url·enrich tail)·151(원문보기 자가치유)·near-dup cluster_id 기구현.

---

## 0. 한 줄

enrich 단계에서 **이미 수행 중인 구글뉴스 리다이렉트 해소** 결과를 `contents.canonical_url`에 저장하고, 같은 canonical을 가진 기존 행이 있으면 **cluster_id로 병합**(교차중복 해소)한다. 원문 보기(151)는 canonical_url을 우선 사용해 클릭 시 재fetch를 줄인다. 기존 코퍼스는 **원클릭 백필**로 채운다.

## 1. 현행 진단 (검증된 코드 사실)

- `normalizeUrl`(normalize.ts)은 이미 추적파라미터·fragment 제거·쿼리정렬·호스트 소문자화 수행 → **일반 URL은 이미 정규화**됨. 진짜 갭은 **구글뉴스 리다이렉트**(`news.google.com/rss/articles/...`)뿐.
- `resolveArticleUrl`(resolve-url.ts)은 구글뉴스만 실제 fetch로 해소, 그 외 즉시 반환. **enrich tail**(orchestrator `enrichRecentContents`, 본문 추출용, ≤30건/런)과 **151 원문보기 라우트**에서 이미 호출 중 — 그러나 **해소 결과를 dedup 키로 저장하지 않음**.
- 삽입 dedup = `contents_original_url_key`(부분 유니크, `where original_url is not null`) → 같은 구글뉴스 리다이렉트는 멱등 스킵되나, **다른 리다이렉트 URL의 동일 원문은 못 잡음**.
- 151은 클릭 시 `original_url`을 해소값으로 **덮어씀**(자가치유). `original_url`엔 유니크 인덱스가 있어 다른 행과 같은 값으로 덮으면 23505 위험 → **canonical은 별도 컬럼**이 안전.
- near-dup 대표 승격 패턴 존재(orchestrator ~352): `repId = match.cluster_id ?? match.id`, 단독이면 대표 승격 후 편입. → 재사용.

## 2. DB / SQL (수희 핸드오프)

`docs/sql-handoff/196-canonical-url.sql` — 이미 작성·**먼저 커밋·푸시**.
- `contents.canonical_url text`(add if not exists) + 부분 인덱스 `idx_contents_canonical_url (canonical_url) where canonical_url is not null`. **unique 아님**(전환기 null·클러스터 병합 방식).
- 미적용(42703) → 196 코드 graceful(canonical 미저장, 기존 동작 유지).

## 3. 구현 (크롤 삽입 무변경 — enrich + 백필 + 원문링크)

### 3-1. 공유 헬퍼 — `resolveCanonical`(resolve-url.ts 또는 enrich-body.ts)
```ts
// 원문 URL 해소 후 normalizeUrl 로 표준화. 실패 시 normalizeUrl(original) 반환(throw 금지).
export async function resolveCanonical(originalUrl: string): Promise<string> {
  const resolved = await resolveArticleUrl(originalUrl)
  return normalizeUrl(resolved)
}
```
enrich·백필 양쪽에서 재사용(DRY, enrichOneBody 패턴).

### 3-2. enrich 통합 — `enrichRecentContents`(orchestrator)
- 이미 `resolveArticleUrl(row.original_url)`을 호출하므로, 그 자리에서 `const canonical = normalizeUrl(resolved)` 계산(추가 fetch 0).
- 해당 행 update에 `canonical_url: canonical` 합류(기존 body 업데이트 update와 합치거나 별도 update). **42703 graceful**: canonical_url 컬럼 없으면 해당 필드 제외 재시도(148/155 패턴).
- **교차중복 클러스터 병합**(신규 헬퍼 `mergeByCanonical(admin, rowId, canonical)`):
  - `contents`에서 `id <> rowId AND (canonical_url = canonical OR original_url = canonical)` 1건 조회(가장 오래된/대표 우선, limit 1).
  - 있으면 `repId = found.cluster_id ?? found.id`; found가 단독이면 `update found set cluster_id = repId`(대표 승격) → `update thisRow set cluster_id = repId`. (near-dup 패턴 재사용, 피드는 cluster로 대표 1건 노출 → 중복 숨김.)
  - 없으면 no-op.
- 실패·격리: 모든 canonical 로직은 try/catch로 enrich 본류(본문 추출) 무중단.

### 3-3. 백필 — `/api/admin/canonical-backfill`(신규, service_role, 128/155 미러)
- **GET** `?limit=N`(clamp 1~30, maxDuration 300): `canonical_url IS NULL AND original_url IS NOT NULL` 대상(collected_at 최신 우선) N건 → 각 `resolveCanonical` → `canonical_url` set + `mergeByCanonical`. 반환 `{ processed, resolved, deduped, remaining }`.
- RPC/컬럼 미적용(42703)·오류 graceful(부분 진행 보존).
- **AdminContentManager**에 "원문 URL 정규화" 버튼(128 "본문 보강"과 동형, remaining 0까지 반복 클릭). 결과 토스트(정규화 N·중복병합 M·남은 K).

### 3-4. 원문 보기 개선 — `/api/contents/[id]/source`(151)
- select에 `canonical_url` 추가. **canonical_url 있으면** 그 값으로 302(재fetch·자가치유 스킵 — 이미 해소됨). 없으면 기존 로직(resolveArticleUrl + original_url 자가치유) 유지.
- 42703(컬럼 없음) graceful: canonical 미선택 → 기존 경로.

### 3-5. (범위 밖 → 197)
- 제목 유사도 기반 near-dup(같은 사건·다른 원문 URL) 클러스터링 = **197**. 196은 **동일 원문(canonical 일치)** 병합까지.

---

## 4. 회귀 가드 / 비기능 요건

- **크롤 삽입 hot-path 무변경**·추가 fetch 0(enrich의 기존 resolve 재사용). 백필은 어드민 트리거.
- canonical_url 컬럼 미적용(42703) → 저장·병합·원문보기 canonical 전부 graceful skip, 기존 동작 유지(회귀 0).
- canonical 병합은 **cluster_id만** 세팅(데이터 삭제 없음, 되돌리기 쉬움). 피드는 기존 cluster 대표 노출 로직 재사용.
- `original_url` 유니크 인덱스 무충돌(canonical은 별도 컬럼, unique 아님).
- 어드민 한정·service_role. 신규 hex 0. LLM·신규 npm 의존 0.

## 5. 검증 (Sonnet 자체)

1. `npx tsc --noEmit` 0 / `npx eslint` 0 / build 통과(`/api/admin/canonical-backfill` 라우트 포함)
2. 수집 1회 후 구글뉴스 유래 신규분 `canonical_url` 채워짐(enrich 대상 내)
3. 같은 원문의 서로 다른 구글뉴스 URL 2건 → 같은 cluster_id로 병합(피드 대표 1건 노출)
4. "원문 URL 정규화" 버튼 반복 → remaining 0까지 진행, 중복병합 카운트 노출
5. 원문 보기: canonical_url 있으면 재fetch 없이 원문으로 302
6. **컬럼 미적용(42703) 시** 수집·enrich·원문보기 정상(canonical만 보류) — 회귀 0, 신규 hex 0

## 6. 후속 (범위 밖 → 197)

- **197**: 제목 유사도 near-dup 클러스터링(같은 사건·다른 원문) — 196 canonical-병합된 코퍼스 위.
- canonical 기반 원문 dead-link 재점검(155 연계)·삽입 시점 인라인 해소(perf 여유 시).
- 매체 접미사 정규화·AMP/모바일 URL 통합.

## 7. 라이브 검증 체크리스트 추가분

- [ ] 구글뉴스 유래 콘텐츠에 canonical_url(해소된 원문)이 채워진다
- [ ] 같은 원문의 중복 수집이 한 클러스터로 묶여 피드에 1건만 대표로 보인다
- [ ] "원문 URL 정규화" 백필로 기존 코퍼스가 채워지고 중복이 병합된다
- [ ] 원문 보기가 canonical로 즉시 이동한다(재fetch 감소)
- [ ] 컬럼 미적용 시에도 수집·원문보기가 정상
