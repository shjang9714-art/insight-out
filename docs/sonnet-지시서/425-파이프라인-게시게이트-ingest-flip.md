# 지시서 425 — 파이프라인 게시-게이트 : ingest reject→stub flip (Phase 1-B)

> 작성: 플래너(Opus) · 2026-07-24 · Phase 1 설계(`Phase1-파이프라인-게시게이트-설계분담-2026-07-24.md`)
> **SQL 의존 없음(개정).** `discovered_at` 쓰기는 이 슬라이스에서 **제외**(A 스키마 준비되면 후속). crawl_interval NULL은 코드 기본값으로 처리(A 데이터 보정 없이도 동작). → **A(SQL) 없이 바로 진행 가능.**
> 착지: **C(Supabase 보강 워커)와 함께가 이상적**. 단독 반영도 가능하나, 그 경우 pending 은 기존 일1회 백필로 **서서히** 게시됨(기존 published 는 무영향).
> 협업 루프: 검증용 브랜치 `agent/425-ingest-publish-gate`(from `origin/main`) → 재현검증 → "커밋해" → 머지.
> 번호: 425 · git author David(yjhead@gmail.com) · **SQL 0.**

---

## 0. 한 줄
정규 소스의 **짧은 RSS 기사를 적재 전 reject 하지 말고 `pending(body_short)`으로 저장**해, 기존 보강→게시 흐름에 태운다. **단 게시 전 관련도(relevance)는 풀본문 기준으로 반드시 통과해야 한다**(off-topic 유입 방지).

---

## 1. 착수 전 확인 (필수 정독)
- `orchestrator.ts` `processCrawlItem`:
  - **L437 reject**: `if (!src.isSearchSourced && bodyLength(item.body) < minBodyLength) { rejected++; return {} }` ← **이걸 바꾼다.**
  - L488~ 관련도 분류: `relatednessScore` → `contentStatus: 'pending'|'published'`, `reviewReason`('low_relevance' 등), 애매밴드 LLM 재판정(`classifyRelevance`). `exempt = trust_tier>=2 || groups.length===0 || type==='web_insight'`.
  - `matchKeywordGroups`로 `matched_groups` 세팅.
- `enrichRecentContents`(L~1120): `body_fetched_at IS NULL` 대상 풀본문 추출 → **`review_reason ∈ BODY_REVIEW_REASONS` 이고 `assessBodyQuality(fullBody)===null`이면 `status: pending→published`**(L77 부근).
- 상수: `BODY_REVIEW_REASONS = {body_short, body_missing, body_truncated, extract_failed}`(orchestrator L1101). `ReviewReason`: body_missing/body_short/body_truncated/low_relevance/llm_irrelevant/excluded_rule.

## 2. 구현

### 2.1 L437 reject → stub(pending) 전환 (`processCrawlItem`)
- **하드 reject 제거.** 대신 플래그: `const bodyShort = !src.isSearchSourced && bodyLength(item.body ?? null) < minBodyLength`.
- **유지(계속 reject)**: 광고(`isAdLike`)·`effectiveLength < MIN_EFFECTIVE_LENGTH`·제외규칙(`exclusionMatch.action==='reject'`). 이건 진짜 쓰레기.
- `bodyShort` 기사는 정상 흐름(관련도 분류·matched_groups) 그대로 타되, **최종 status/reason 을 강제**:
  - `if (bodyShort) { contentStatus = 'pending'; reviewReason = 'body_short' }` — 관련도 결과를 덮어써 **body 계열 pending 으로 확정**(짧은 RSS 로는 관련도를 확정 못 하므로 풀본문까지 보류). 단 **이미 관련도로 published 판정이라도** bodyShort면 pending 으로 내린다(보강 후 재판정).
- ⚠️ **`discovered_at` 은 이 슬라이스에서 쓰지 않는다**(A 스키마 미적용 상태 가정 — 컬럼 없으면 insert 런타임 실패). A 적용 후 별도 슬라이스에서 추가.

### 2.2 🔴 게시 전 관련도 보존 (`enrichRecentContents`) — off-topic 유입 방지
현재는 body 계열 pending + 본문품질 통과면 **무조건 published**. 여기에 **관련도 게이트를 더한다**:
- 풀본문 확보 + `assessBodyQuality(fullBody)===null` 후, **published 로 올리기 전에 관련도 확인**:
  - **관련도 통과 조건**(기존 로직 재사용): 해당 기사가 `matched_groups` 를 하나라도 가졌거나(= 키워드그룹 매칭됨) **exempt 소스**(trust_tier≥2·groups 0·web_insight)이면 통과 → `status='published'`, `review_reason=null`.
  - 통과 못 하면 **published 로 올리지 않고** `review_reason='low_relevance'` 로 전환(pending 유지) — 다시 게시 대상 아님.
- 이를 위해 enrich 대상 select 에 **`matched_groups`(+ 판단에 필요한 소스 trust_tier/type)** 추가. 소스 정보가 필요하면 `contents.source_id` 로 최소 조인 or 소스 맵 전달.
- ⚠️ **기존 body 계열 pending(search 소스 등)의 게시 동작을 회귀시키지 말 것** — 관련도 게이트는 "매칭됐거나 exempt면 통과"라 기존에 published 되던 정상 기사는 그대로 통과해야 한다(정상 기사는 matched_groups 있거나 exempt). 육안·회귀가드로 확인.

### 2.3 소스 스케줄 (`schedule.ts` `selectCrawlSources`)
- `crawl_interval_minutes` NULL/0 → **영구 제외 대신 코드에서 기본 주기 적용**(예: 720분). **A 데이터 보정 없이 코드만으로 동작**(SQL 불요).
- `disabled=true`(또는 `is_active=false`)만 명시 제외.

## 3. 하지 말 것
- 광고·effectiveLength·제외규칙 reject **제거 금지**(진짜 쓰레기 차단 유지).
- **관련도 없이 body_short 기사를 게시하지 말 것**(§2.2 — off-topic 유입 방지). 이게 이 슬라이스의 품질 핵심.
- 검색 소스(isSearchSourced) 기존 흐름·서빙(status='published' 필터) 무변경.
- 스키마 변경 금지(A 담당). enum 무변경.
- `contentStatus`·`reviewReason` 외 무관 로직 손대지 않기.

## 4. 회귀 가드
1. **짧은 RSS 정규소스 기사**가 이제 **적재됨**(rejected 아님) — `pending`, `review_reason='body_short'`.
2. 보강으로 풀본문 확보 + 품질 통과 + **관련도(matched_groups/exempt) 통과 시에만 published**.
3. **관련도 미통과 short 기사는 게시 안 됨**(low_relevance pending) — off-topic 홍수 없음.
4. 광고·너무짧음·제외규칙은 여전히 reject.
5. **기존 published 정상 기사·검색소스 흐름 회귀 없음**(매칭/exempt면 통과).
6. `crawl_interval_minutes` NULL 소스도 수집 대상(영구 제외 아님).
7. 서빙(status='published')·다른 파이프라인 무영향.
8. **`discovered_at` 등 스키마 미변경 컬럼 참조 없음**(A 없이도 런타임 정상).

## 5. 검증
```bash
npx tsc --noEmit && npm run lint && npm run build
grep -n "bodyTooShort\|bodyShort\|body_short" src/lib/crawler/orchestrator.ts
grep -c "discovered_at" src/lib/crawler/orchestrator.ts   # 0 (이 슬라이스에서 안 씀)
grep -n "matched_groups\|assessBodyQuality\|status = 'published'\|low_relevance" src/lib/crawler/orchestrator.ts   # enrich 관련도 게이트
grep -n "crawl_interval_minutes" src/lib/crawler/schedule.ts
git diff --stat origin/main
```
**라이브 육안 (배포 후 · A 적용 후)**
- [ ] 그간 안 보이던 소스의 기사가 게시되기 시작(소스 다양성↑)
- [ ] 단일 매체 최고 비중 하락
- [ ] off-topic/무관 기사가 늘지 않음(관련도 게이트 유지)
- [ ] crawl_logs rejectedBy.bodyTooShort 급감

## 6. 커밋
브랜치 `agent/425-ingest-publish-gate` → 커밋·푸시 → 재현검증 → "커밋해" → 머지.
스테이징: `src/lib/crawler/orchestrator.ts` · `src/lib/crawler/schedule.ts` · 이 지시서
제외: 상시 목록(topic-covers NFD·council-bridge·성능-리전이동·골드샘플).
커밋: `feat: 파이프라인 게시-게이트 — 짧은 RSS reject→stub(pending) + 관련도 보존 (425)`

### 기록란 (구현자)
| 항목 | 결과 |
|---|---|
| L437 reject→pending(body_short) 전환 | |
| enrich 게시 전 관련도(matched_groups/exempt) 게이트 추가 | |
| 기존 published/검색소스 회귀 없음 확인 | |
| schedule NULL interval 코드 기본값 방어 | |
| discovered_at 등 미변경 스키마 컬럼 미참조 | |

## 7. 착지·다음
- **A(스키마) 적용 후, C(보강 워커)와 함께 반영.** B 단독 반영 시 pending 적체·게시 지연 주의(설계 §3).
- C 워커가 서면 백필·재시도·424 보고서 생성이 그 위에.
