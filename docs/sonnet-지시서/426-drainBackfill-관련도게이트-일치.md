# 지시서 426 — drainBackfill 관련도 게이트 일치 (425 완결)

> 작성: 플래너(Opus) · 2026-07-24 · 425 완결성 갭(백필 경로 관련도 게이트 누락)
> 근거: 425는 `enrichRecentContents`(orchestrator.ts, 크롤 tail)에만 관련도 게이트 추가. `drainBackfill`(enrich-body.ts, body-backfill 크론)은 **본문 품질만 보고 게시** → 425가 만든 `body_short` pending 이 관련도 검사 없이 게시됨.
> 협업 루프: 검증용 브랜치 `agent/426-drain-relevance-gate`(from `origin/main`) → 재현검증 → "커밋해" → 머지.
> 번호: 426 · git author David(yjhead@gmail.com) · **SQL 0.**

---

## 0. 한 줄
`drainBackfill`(및 같은 파일의 강제 재보강 경로)의 **pending→published 승격에 425와 동일한 관련도 게이트**를 넣어, 두 enrich 경로를 일치시킨다. off-topic 유입을 백필 경로에서도 막는다.

---

## 1. 착수 전 확인
- `src/lib/contents/enrich-body.ts`:
  - `BODY_REVIEW_REASONS`(L17) 동일 정의 존재.
  - 승격 블록(L105~110): `if (review_reason ∈ BODY_REVIEW_REASONS && assessBodyQuality(extracted)===null) { status='published'; review_reason=null }` — **관련도 게이트 없음.**
  - `drainBackfill`(L183~) select(L194): `id, original_url, body_original, thumbnail_url, status, review_reason` — **matched_groups·source_id 없음.**
  - 같은 파일에 강제 재보강(`enrichByIds` 류, L132/145)도 동일 승격 블록이면 함께 수정.
- 참고(미러 대상): 425가 `enrichRecentContents`에 넣은 관련도 게이트:
  ```ts
  const relevancePass =
    (row.matched_groups?.length ?? 0) > 0 ||
    keywordGroupCount === 0 ||
    (source?.trust_tier ?? 0) >= 2 ||
    source?.type === 'web_insight'
  if (relevancePass) { status='published'; review_reason=null }
  else { status='pending'; review_reason='low_relevance' }
  ```

## 2. 구현 (`enrich-body.ts`)

### 2.1 select 확장
- 보강 대상 select 에 **`source_id, matched_groups`** 추가(drainBackfill·enrichByIds 등 승격 블록을 타는 모든 조회).

### 2.2 관련도 컨텍스트 확보
- **활성 키워드 그룹 수** `keywordGroupCount`: drainBackfill 시작 시 1회 조회(`keyword_groups` 활성 count). enrichByIds 등도 같은 값 사용.
- **소스 정보**: 대상 행들의 `source_id` 로 `sources(id, trust_tier, type)` 한 번에 조회해 `Map` 구성(425 방식 동일).

### 2.3 승격 블록에 관련도 게이트 삽입
- 기존 `assessBodyQuality===null` 통과 후, 게시 전 **relevancePass 판정**(위 §1 미러):
  - 통과 → `status='published'`, `review_reason=null`.
  - 미통과 → **published 로 올리지 않음**: `status='pending'`, `review_reason='low_relevance'`.
- ⚠️ **BODY_REVIEW_REASONS 밖(low_relevance/llm_irrelevant/excluded_rule)은 여전히 안 건드림**(기존 주석 L102-103 원칙 유지).

### 2.4 공용화 권장(선택)
- 425 orchestrator 와 이 파일이 같은 relevancePass 식을 쓰므로, 원하면 `quality.ts` 등에 `passesEnrichRelevance({matchedGroups, keywordGroupCount, trustTier, type})` 헬퍼로 추출해 양쪽 공유(중복 방지). 부담되면 각 파일 인라인도 허용하되 식은 동일하게.

## 3. 하지 말 것
- 본문 품질 판정(`assessBodyQuality`)·`body_fetched_at` 마킹·추출 로직 무변경.
- BODY_REVIEW_REASONS 밖 review_reason 건드리지 않기(관련도/제외 판정 보존).
- 425(enrichRecentContents) 무수정(이미 게이트 있음). 이 슬라이스는 enrich-body.ts.
- 스키마 변경 없음.

## 4. 회귀 가드
1. body-backfill(drainBackfill) 로 `body_short` 승격 시 **관련도(matched_groups/exempt) 통과분만 published**.
2. 관련도 미통과 → low_relevance pending 유지(게시 안 됨).
3. **기존 정상 body 계열 pending(매칭됨/exempt)은 그대로 published**(회귀 없음).
4. BODY_REVIEW_REASONS 밖은 무변경.
5. enrichByIds(강제 재보강)도 동일 게이트 적용(있으면).
6. 425(크롤 tail)와 **동일 판정**(두 경로 일치).

## 5. 검증
```bash
npx tsc --noEmit && npm run lint
grep -n "matched_groups\|source_id\|keywordGroupCount\|relevancePass\|trust_tier\|web_insight\|low_relevance" src/lib/contents/enrich-body.ts
grep -n "keyword_groups" src/lib/contents/enrich-body.ts   # 활성 그룹 수 조회
git diff --stat origin/main
# 425 enrichRecentContents 의 relevancePass 식과 동일한지 대조(육안)
```
**라이브(배포 후)**
- [ ] 백필로 게시되는 short 기사가 관련도 통과분만
- [ ] off-topic 백필 게시 없음
- [ ] 425 크롤 tail 과 동일 동작

## 6. 커밋
브랜치 `agent/426-drain-relevance-gate` → 커밋·푸시 → 재현검증 → "커밋해" → 머지.
스테이징: `src/lib/contents/enrich-body.ts` · (공용화 시 `src/lib/crawler/quality.ts`·`orchestrator.ts`) · 이 지시서
제외: 상시 목록(topic-covers NFD·council-bridge·성능-리전이동·골드샘플).
커밋: `fix: drainBackfill 관련도 게이트 추가 — 425 백필 경로 일치 (426)`

### 기록란 (구현자)
| 항목 | 결과 |
|---|---|
| drainBackfill 승격에 관련도 게이트 | |
| enrichByIds 등 동일 승격 경로도 적용 | |
| keywordGroupCount·source 조회 | |
| 425 식과 동일 확인 | |
| BODY_REVIEW_REASONS 밖 무변경 | |

## 7. 다음
- 426 반영 후 **두 enrich 경로가 일치** → C(보강 워커: pg_cron 또는 GitHub Actions 등으로 body-backfill 자주 호출)를 안전하게 세팅.
