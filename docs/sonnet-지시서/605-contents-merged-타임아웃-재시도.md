# 605 — contents.merged 57014 타임아웃 1회 재시도(웜 캐시 완화책)

> 트리아지(Sonnet) · 2026-09-03 · 기준 `origin/main = 10459b27697fc47737873aed79cf9c1156e04f58`(604 머지 반영)
> 선행: 604(`use-unified-search.ts` 동시 발사 제한 + 전 구간 계측) — 배포 확인 완료, 그런데도 여전히 실패
> 근거: 아래 §0 전부 이번 세션에서 직접 재현·측정. **DDL·SQL 없음.**

★합격 기준: `contents.merged`가 57014로 죽어도, 앞선 시도가 이미 읽어들인 페이지 덕에
재시도가 성공할 여지를 준다. 실패해도 기존 동작(배너 + 부분 결과 표시)보다 나빠지면 안 된다.

---

## 0. 지금 상태 — 604 배포했는데도 재현된다 (코드·DB로 직접 확인)

**604는 origin/main에 머지·배포됐다(`10459b27`).** 그런데 배포 후 실제 프로덕션
(`https://insight-out-app.vercel.app`)에서 'AIDC' 검색을 재현하니 **빨간 배너가 그대로 뜬다.**

브라우저 콘솔 실측(604가 604 자신이 추가한 계측):

```
keywords / insights / entities / entities.links / keywords.links   → 전부 3초 안에 성공
contents 1단계                                                      → 검색 시작 8초 뒤
[search] 실패: contents.merged code=57014 message=canceling statement due to statement timeout
```

**범인은 항상 `contents.merged`(round1의 콘텐츠 병합 쿼리, `use-unified-search.ts` 배열 맨 앞
태스크) 하나뿐이다.** 다른 5개 소스는 604 이후 전부 정상.

### 604의 가설은 절반만 맞았다

604는 "동시 발사가 shared_buffers(224MB)를 서로 밀어내 콜드로 만든다"는 가설로
`SEARCH_QUERY_CONCURRENCY=3`을 도입했다. 그런데도 여전히 정확히 8초에 걸려 취소된다.

**이번 세션에서 프로덕션 DB(Supabase MCP, `xalptogjhbiahrbgxhvu`)에 직접
`EXPLAIN (ANALYZE, BUFFERS)`를 두 번 돌려 콜드/웜 차이를 실측했다** — 604가 인용한
같은 SQL(`status='published' AND (title ILIKE '%AIDC%' OR summary_ko ILIKE '%AIDC%'
OR search_vector @@ to_tsquery('simple','AIDC:*')) ORDER BY published_at DESC LIMIT 240`):

```
1차 실행(콜드)  Execution Time 2778.299 ms
                Bitmap Heap Scan: Buffers shared hit=2428 read=551  (디스크에서 551블록 읽음)
                Heap Blocks: exact=1548 · rows=1813 (후보) → 240행으로 정렬

2차 실행(웜, 바로 이어서)  Execution Time 21.786 ms   ← 128배 차이
                Buffers: 전부 shared hit, read=0 (전부 캐시 적중)
```

**즉 이 쿼리는 캐시가 식어 있으면 혼자서도 ~2.8초가 걸리고, 데워져 있으면 22ms다.**
604의 concurrency=3 아래에서도 여전히 8초를 넘긴 건, `fetchEntities`·`fetchKeywords`가
각각 `content_entities`/`content_keywords`를 `contents!inner(published_at)`로 조인해서
**같은 `contents` 힙 페이지를 동시에 두드리기 때문**으로 보인다(확정은 아니다 — 더 깊은
검증은 범위 밖, 아래 참고).

### `contents` 테이블·인덱스 실측 (Supabase MCP, 이번 세션)

```
shared_buffers          224MB (28672 * 8kB)          — 604가 인용한 값과 일치, 재확인됨
contents 힙             49MB
contents 전체(인덱스+TOAST 포함)  617MB
contents_search_vector_idx (GIN)  105MB   ← shared_buffers의 거의 절반 크기
contents_title_trgm_idx           14MB
contents_summary_ko_trgm_idx      12MB
approx_rows              41,949행
```

224MB 캐시에 105MB짜리 GIN 인덱스 하나만 담아도 절반이 찬다. 다른 테이블·인덱스·
정기적으로 도는 크론까지 같은 캐시를 나눠 쓰므로, 검색어가 바뀔 때마다(트라이그램/FTS
매칭 행이 다르므로 만지는 힙 페이지도 매번 다르다) 콜드일 확률이 높다.

### ⚠️ `authenticated` 역할의 8초 타임아웃은 601-A가 의도적으로 남긴 것이다 — 건드리지 않는다

```sql
-- pg_roles.rolconfig 실측 (이번 세션)
anon           statement_timeout = 3s
authenticated  statement_timeout = 8s   ← 601-A가 "사용자 브라우저가 직접 타는 경로라
                                            짧은 게 맞다"고 명시적으로 유지를 결정한 값
service_role   statement_timeout = 30s  (601-A에서 8s→30s로 올린 것, MCP 전용)
```

`docs/sql-handoff/601-A-service_role-statement_timeout.sql` 마지막 줄:
「⚠️ anon(3s)·authenticated(8s)는 건드리지 않는다. 그쪽은 사용자 브라우저가 직접 타는
경로라 짧은 게 맞다.」 **이 결정을 뒤집을 근거가 이번에 새로 생기지 않았다. 그대로 둔다.**

### 왜 "재시도"인가 — 다른 후보를 배제한 이유

```
authenticated 타임아웃 상향     → 601-A 결정 위반. 하지 않는다
CONTENT_MERGE_LIMIT·기간 제한  → 후보 행 수를 줄이면 콜드 비용도 줄겠지만,
  도입(sinceDays 등)             "과거 자료가 검색에서 빠질 수 있다"는 제품 결정이 필요하다.
                                 이 지시서 범위 밖 — David 판단 대기 항목으로만 남긴다
shared_buffers 상향(DB 플랜)    비용이 드는 인프라 결정. David 판단 대기 항목으로만 남긴다
concurrency 값 재조정           604가 이미 3으로 낮췄다. 추가로 낮춘다고 "쿼리 자체가
                                 콜드일 때 2.8초 걸린다"는 사실 자체는 안 바뀐다
```

남는 것은: **실패한 시도가 이미 필요한 페이지 상당수를 캐시에 읽어들였을 가능성이 높으니
(실측: 웜 22ms), 57014를 받으면 그 자리에서 한 번만 다시 시도한다.** 근본 해결책이
아니라 완화책이다 — 성공률을 얼마나 올리는지는 배포 후 콘솔로 판정한다(§검증 참고).

---

## 1. `contents.merged`가 57014로 실패하면 즉시 1회 재시도한다

파일: `src/lib/search/use-unified-search.ts`

`round1StartedAt`/`settled`/`console.debug('[search] round1', ...)` 다음, `fulfilled`를
계산하기 **전에** 삽입한다(round2의 "빈 콘텐츠 섹션 재조회" 판정이 재시도 결과를 그대로
보게 하려면 fulfilled/rejected 계산보다 앞서야 한다):

```ts
// 605 — contents.merged 가 57014(DB statement_timeout)로 실패하면 그 자리에서 한 번만
// 재시도한다. 앞선 시도가 필요한 힙 페이지 상당수를 이미 shared_buffers 에 읽어들였을
// 가능성이 높다(실측: 콜드 2.8s → 웜 22ms, 128배). 근본 해결책이 아니라 완화책이다 —
// ★ 다른 소스(insights·issues·entities·keywords)의 57014는 재시도하지 않는다. 이번엔
// contents.merged 하나만으로 범위를 좁힌다.
if (!filter) {
  const contentsMergedIndex = tasks.findIndex((t) => t.name === 'contents.merged')
  const first = settled[contentsMergedIndex]
  if (
    contentsMergedIndex >= 0 &&
    first.status === 'rejected' &&
    (first.reason as { code?: string } | null)?.code === '57014'
  ) {
    const retryStartedAt = performance.now()
    try {
      const value = await tasks[contentsMergedIndex].run()
      settled[contentsMergedIndex] = { status: 'fulfilled', value }
      console.debug('[search] contents.merged 재시도 성공', {
        ms: Math.round(performance.now() - retryStartedAt),
      })
    } catch (reason) {
      settled[contentsMergedIndex] = { status: 'rejected', reason }
      console.debug('[search] contents.merged 재시도 실패', {
        ms: Math.round(performance.now() - retryStartedAt),
      })
    }
    if (cancelled || controller.signal.aborted) return
  }
}
```

- ⚠️ `filter`가 지정된 단일 카테고리 검색에서는 `contents.merged` 태스크 자체가 없다
  (`sourceNameFor`가 `contents.<key>`로 이름을 매긴다) — `!filter` 가드로 건드리지 않는다.
- ⚠️ 재시도도 같은 `controller.signal`을 그대로 써야 한다(`tasks[idx].run()`이 이미
  `fetchContentCategory(..., controller.signal, sinceDays)`를 캡처하고 있으므로 별도
  전달 불필요 — 다만 재시도 로직을 다른 곳으로 옮기면서 이 캡처를 깨지 마라).
- ⚠️ 재시도 직후 취소 확인(`cancelled || controller.signal.aborted`)을 빠뜨리지 마라 —
  597 이후 지켜온 계약이다.
- 재시도가 성공하면 이후의 `fulfilled`·`rejected`·round2("빈 콘텐츠 섹션 재조회") 판정은
  전부 자동으로 갱신된 `settled[contentsMergedIndex]`를 본다 — 별도 분기 필요 없음.
- 재시도가 다시 실패해도 기존 동작(배너 + 다른 섹션 부분 표시)과 동일하게 흘러간다 —
  퇴행 없음.

---

## 하지 않을 것

- **`authenticated` 역할 statement_timeout 변경** — 601-A가 명시적으로 유지를 결정했다.
- **`CONTENT_MERGE_LIMIT`·`SEARCH_DEFAULT_SINCE_DAYS` 변경** — 후보 행 수를 줄이는 방향이
  근본적으로는 더 맞을 수 있지만 제품 결정(과거 자료 검색 범위 축소)이 필요하다. 손대지
  말고 인수인계에 "David 판단 대기"로만 남겨라.
- **`SEARCH_QUERY_CONCURRENCY` 값 변경** — 604가 3으로 정했다. 이번 지시서는 그 값을
  바꾸지 않는다.
- **다른 소스(insights·issues·entities·keywords)의 57014 재시도 추가** — 이번엔
  `contents.merged` 하나로 범위를 좁힌다. 다른 소스도 필요해지면 별도 지시서로 낸다.
- **round2(빈 콘텐츠 섹션 재조회)의 "조용히 무시" 규칙, 57014 배너 문구, AbortController
  취소 로직** — 전부 기존 그대로 둔다.
- **DB 인덱스·스키마·shared_buffers(플랜 티어) 변경** — SQL·인프라 결정은 범위 밖.

---

## 검증

1. `npx tsc --noEmit` / `npm run lint` / `npm run build` — 전부 통과, 출력을 보고에 붙여라.
2. 코드로 확인 — `git grep -n "contents.merged 재시도" src/lib/search/use-unified-search.ts`
   가 2곳(성공·실패 로그) 나와야 한다.
3. 단위 확인(임시 스크립트, 커밋하지 마라) — `tasks[idx].run`을 첫 호출은
   `{code:'57014'}`로 reject, 두 번째 호출은 성공하도록 목(mock)을 만들어
   ① 재시도가 정확히 1번만 일어나는지 ② 재시도 성공 시 `rejected` 배열에
   `contents.merged`가 남지 않는지(=배너가 안 뜨는지) 확인하고 결과를 보고에 남겨라.
4. ★못 한 검증(실기기·배포 후에만 가능) — 배포 후 'AIDC' 등 604가 실패를 재현했던
   검색어로 실제 테스트하고, 브라우저 콘솔에서 다음을 확인:
   ```
   [search] 실패: contents.merged code=57014 ...   ← 1차 실패는 여전히 찍힐 수 있다(정상)
   [search] contents.merged 재시도 성공 { ms }      ← 이게 찍히고 배너가 안 뜨면 완화 성공
   ```
   재시도도 실패하면(`재시도 실패` 로그) 완화책의 한계다 — 그 경우 이후 지시서에서
   `sinceDays` 기본값 도입 여부를 David와 논의해야 한다는 뜻으로 인수인계에 남겨라.
