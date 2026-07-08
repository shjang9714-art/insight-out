# 지시서 220 — near-dup 클러스터링 성숙화(본문 유사도 + 대표 선정 + 백필)

목표: 현재 **제목만·삽입시점**의 near-dup 클러스터링(#12)을 성숙화한다 — ① 본문(어휘) 유사도로 제목만으론 놓친 같은 사건을 병합, ② 대표(대표기사) 선정을 신호 기반으로, ③ 기존 코퍼스 재평가 백필(어드민 벌크 op). 삽입 hot-path는 유지하고 무거운 재평가는 별도 백필로 뺀다.

범위(David): (b) 본문/의미 유사도 + 대표선정 + 백필. **의미(임베딩) 유사도는 인프라(pgvector) 필요 → 본 지시서는 어휘 본문유사도로 구현하고, 임베딩은 선택적 Phase C로 플래그**(추후 David 결정). **SQL 핸드오프 있음**(`cluster_checked_at` 마커).

---

## 1. 현행 진단 (검증된 코드 사실)

- `src/lib/crawler/similarity.ts`: `tokenize`(소문자·한글·불용어·1글자 제거), soft-`jaccard`(2글자 접두 soft match), `titleSimilarity`, `sharesCoreTokens`(공유≥3·비율≥0.5), `SIMILARITY_THRESHOLD=0.9`.
- `src/lib/crawler/dedup.ts` `findSimilarCandidates`: **category='뉴스'**, `collected_at ≥ now-3일`, limit 500, select `id,title,published_at,collected_at,cluster_id`(**본문 없음**).
- 삽입 클러스터링 `orchestrator.ts:342–363`: 후보 중 `titleSimilarity≥0.9 || sharesCoreTokens` 매칭 → `repId = match.cluster_id ?? match.id`, 단독이면 match를 대표 승격(자기참조), 신규행 `cluster_id=repId`.
- **대표 표현**: `cluster_id IS NULL`=대표, 멤버는 `cluster_id=대표id`(self-ref, `ON DELETE SET NULL`). 인덱스 `contents_cluster_idx`.
- **읽기측은 이미 대표 우선**: `related.ts`(같은 cluster 제외), briefing(`usedClusters`), insight `generate.ts:178`(cluster_id null 우선 → importance desc). → **대표를 "가장 좋은 기사"로 두면 품질↑**.
- **대표 선정에 신호 미사용**(첫 매칭 승격). 사용 가능 신호: 소스 `trust_tier`, `importance_score`, `thumbnail_url` 유무, `published_at`(빠른 것), `view_count/bookmark_count`.
- **본문 가용 시점**: 삽입 땐 RSS 스니펫. 전문은 `enrich-body`(`body_fetched_at` 마커, `ENRICH_MIN_BODY_LEN=400`) 이후. → **본문 유사도는 백필(전문 확보 후)에서 하는 게 정확**.
- `mergeByCanonical`(196): canonical_url 동일 교차중복 병합 존재(재사용 참고).
- **기존 코퍼스 재평가 없음**(삽입 1회뿐).

---

## 2. 구현

### 2-0. SQL 핸드오프(선푸시·수희) — `docs/sql-handoff/220-cluster-checked-at.sql`
```sql
alter table public.contents add column if not exists cluster_checked_at timestamptz;
comment on column public.contents.cluster_checked_at is
  '관련기사 재클러스터링(본문 유사도) 재평가 시각(지시서 220). null=미평가(백필 대상).';
create index if not exists idx_contents_cluster_recheck
  on public.contents (collected_at desc)
  where category = '뉴스' and cluster_checked_at is null;
```

### 2-1. 본문 어휘 유사도 유틸 (`similarity.ts` 확장)
- `bodyTokens(body): string[]` — `tokenize` 재사용(길이 상한, 예: 앞 1500자).
- `bodySimilarity(b1,b2): number` — `jaccard(bodyTokens(b1),bodyTokens(b2))`(soft match 그대로). 짧으면(<8토큰) 0.
- **결합 판정** `isNearDup(a,b, hasBody)`:
  - `titleSimilarity ≥ 0.9 || sharesCoreTokens` (기존) **또는**
  - `titleSimilarity ≥ 0.55 && bodySimilarity ≥ BODY_SIM_THRESHOLD(예 0.5)` (제목 부분일치 + 본문 강한 일치 = 같은 사건 다른 제목).
  - 상수 `BODY_SIM_THRESHOLD`·`TITLE_SOFT_FOR_BODY(0.55)`는 `similarity.ts`에 export(튜닝 지점).

### 2-2. 대표 선정 (`cluster.ts` 신설)
`pickRepresentativeId(members): string` — 정렬 우선순위:
1. 소스 `trust_tier` desc, 2. `thumbnail_url` 유무(있음 우선), 3. `importance_score` desc, 4. `published_at` **오름차순(최초 보도)**, 5. `collected_at` asc.
- `applyRepresentative(admin, members, repId)`: `repId` 행 `cluster_id=null`, 나머지 멤버 `cluster_id=repId`로 정렬(대표 교체·병합 반영).

### 2-3. 재클러스터링 백필 (`cluster-backfill.ts` 신설) — 219/body-backfill 패턴 미러
`drainClusterBackfill(admin,{limit=20,from,to,deadline})`:
- 대상: `category='뉴스' AND cluster_checked_at IS NULL AND body_fetched_at IS NOT NULL`(전문 확보분), order collected_at desc, limit.
- 각 대상 행 r에 대해:
  1. 같은 윈도우 후보 조회(`findSimilarCandidates` 확장판: body_original 포함, 예 7일·limit 300).
  2. `isNearDup(r, cand, hasBody=true)` 매칭 집합 = r + 매칭들의 기존 클러스터 멤버 합집합.
  3. 매칭 있으면 `pickRepresentativeId`로 대표 재선정 → `applyRepresentative`로 병합/재지정.
  4. **항상** r.`cluster_checked_at = now()` 기록(무한 재평가 방지).
- 반환 `{processed, merged, repChanged, remaining, ready}`(42703 → ready:false).
- 배치 limit 작게(20) + deadline. 안전: 병합은 cluster_id 재지정뿐(행 삭제 없음).

### 2-4. API + 어드민 UI
- `src/app/api/admin/cluster-backfill/route.ts`(body-backfill 미러, limit 1~30 기본 20).
- `AdminContentProcessing.tsx`에 박스 "관련기사 재클러스터링(본문 유사도)" 추가(219 핸들러 미러, 카운터 merged/repChanged, ready:false 시 "220 SQL 적용 필요" 안내).

### 2-5. (옵션·미구현) Phase C 의미 임베딩
`pgvector` 확장 + `contents.embedding vector` + enrich 시 임베딩 생성 + 코사인 유사도. **인프라·비용 큼 → 별도 승인 후 별도 지시서.** 본 지시서는 어휘 본문유사도까지만.

---

## 3. 회귀 가드
- **삽입 hot-path 무변경**(제목 클러스터링 그대로) — 백필만 추가.
- 병합은 `cluster_id` 재지정만(행 삭제·본문 변경 없음). `ON DELETE SET NULL` 안전.
- 읽기측(related/briefing/insight)은 이미 cluster_id 기반 → 대표 재선정 시 자동으로 더 좋은 대표 노출.
- `cluster_checked_at`으로 종료 보장(무한 루프 없음), 42703 graceful.
- 백필 배치 작게 + deadline → 부하 제어.
- 기존 클러스터를 깨지 않도록: 매칭 없으면 대표/멤버 불변, 마커만 기록.

## 4. 검증
- `npx tsc --noEmit` 0, `npx eslint`(수정/신규) 0, `npm run build`.
- 유사도 유닛 감각: 같은 사건 다른 제목 쌍이 `isNearDup` true, 무관 쌍 false(샘플 콘솔 점검).
- SQL 미적용 시 op degrade(ready:false), 크롤·표시 불변.

## 5. 라이브 체크리스트(수희 SQL 적용 후)
- [ ] content-data에 "관련기사 재클러스터링" 박스.
- [ ] 실행 → 제목만으론 안 묶이던 같은 사건이 한 클러스터로(merged 증가), 피드/관련기사에서 대표 1건+관련 N.
- [ ] 대표가 신호 좋은 기사(신뢰소스·썸네일·최초보도)로 선정.
- [ ] 재실행 시 `cluster_checked_at`로 재대상 아님(remaining 감소·종료).
- [ ] 삽입 크롤·기존 표시 회귀 없음.

SQL: `docs/sql-handoff/220-cluster-checked-at.sql`(수희 적용, 42703 graceful). 의미 임베딩(Phase C)은 보류.
