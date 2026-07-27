# 지시서 431 — GDELT DOC API 수집 어댑터 (Phase 2 · 소스 폭 확대, 무료·키 불필요)

> 작성: 플래너(Opus) · 2026-07-25 · `GDELT-통합수집-설계-2026-07-25.md` (A)
> 근거: GDELT DOC 2.0 API(무료, 키 불필요, 원문 URL 제공) · 430 네이버 어댑터 패턴 재사용
> 협업 루프: 검증용 브랜치 `agent/431-gdelt-doc`(from `origin/main`) → 재현검증 → "커밋해" → 머지.
> 번호: 431 · git author David(yjhead@gmail.com) · **SQL 0.** (외부 키 없음 — 즉시 활성)

---

## 0. 한 줄
GDELT DOC 2.0 API 를 **검색 수집 백엔드로 병행 추가**(네이버·Google News RSS 와 나란히). 한국 기사 URL 발견 → 기존 파이프라인(stub → 보강 → 425/426 관련도 게시). **무료·키 불필요라 반영 즉시 활성.**

---

## 1. 착수 전 확인
- 430(네이버) 어댑터·통합이 좋은 참고 — 같은 `crawlKeywordSearch` 시드 루프에 병행 추가.
- **GDELT DOC API**: `GET https://api.gdeltproject.org/api/v2/doc/doc`
  - 파라미터: `query`(검색어 + 연산자), `mode=ArtList`, `format=json`, `sort=DateDesc`, `maxrecords=100`(≤250), 기간은 `startdatetime`/`enddatetime`(`YYYYMMDDHHMMSS`, UTC) 또는 `timespan`.
  - 한국 한정: query 에 **`sourcelang:korean`** 연산자 결합(예: `"{seed}" sourcelang:korean`).
  - 반환 JSON `articles[]`: `url`, `title`, `domain`, `seendate`(YYYYMMDDTHHMMSSZ), `language`, `sourcecountry`. **본문/스니펫 없음**(url·title 위주).
  - **키·인증 없음.** 예의상 저빈도.

## 2. 구현

### 2.1 어댑터 `src/lib/crawler/adapters/gdelt-news.ts`
- `export async function fetchGdeltNews(query: string, since: string, opts?: { maxRecords?: number }): Promise<RawItem[]>`
- **선택 비활성 가드**: env `GDELT_ENABLED === 'false'` 면 `[]` 반환(기본 활성). 키는 없음.
- 요청:
  - `q = `"${query}" sourcelang:korean`` (URL 인코딩).
  - `startdatetime = since→UTC(YYYYMMDDHHMMSS)`, `enddatetime = now`. ⚠️ **GDELT DOC 은 최근 3개월까지** — `since` 가 3개월 이전이면 3개월로 clamp(과거 6개월은 432 BigQuery 담당).
  - `mode=ArtList&format=json&sort=DateDesc&maxrecords=100`.
  - `fetch(url, { signal: AbortSignal.timeout(10_000) })`.
- 매핑(발견용):
  - `original_url = article.url` (유효 http(s)만).
  - `title` = 정리(`cleanBodyText(htmlToPlainText())`), 빈 값이면 스킵.
  - `body` = **undefined**(GDELT 본문 없음 — 보강이 원문에서 채움).
  - `published_at` = `seendate`(YYYYMMDDTHHMMSSZ → ISO).
  - `language = 'ko'`.
  - `since` 보다 오래된 seendate 는 제외.
- 오류·비정상 응답: try/catch, 로그 + 부분 반환(크롤 무중단).

### 2.2 검색 수집 병행 (orchestrator `crawlKeywordSearch`)
- 430 에서 `naverItems` 를 합친 지점에 **`gdeltItems = await fetchGdeltNews(seed, since)` 도 합친다**:
  ```ts
  const naverItems = await fetchNaverNews(seed, since, { maxItems: 200 })
  const gdeltItems = await fetchGdeltNews(seed, since)
  const searchItems = [...rawItems, ...naverItems, ...gdeltItems]
  ```
- `isSearchSourced: true` 유지 → 본문 없는 stub 도 pending 적재 → 보강 → 관련도 통과분 게시.
- 중복은 canonical/hash 자동 흡수(네이버·Google·GDELT 겹쳐도 1건).

## 3. 하지 말 것
- 본문을 GDELT 로 확정하지 않기(발견용, 본문은 원문 보강).
- 3개월 초과 과거를 DOC 로 시도하지 않기(clamp — 그건 432 BigQuery).
- 기존 네이버(430)·Google News RSS 수집 **무변경**(병행 추가만).
- 새 스키마·SQL·유료 API 금지.
- GDELT 과도 호출 금지(시드당 1쿼리, timeout).

## 4. 회귀 가드
1. GDELT 출처(한국) 기사도 수집됨 — 소스 다양성↑. `GDELT_ENABLED='false'` 면 스킵.
2. 본문 없는 stub → pending → 보강 → **관련도 통과분만 게시**(425/426).
3. 네이버·Google·RSS 와 중복 자동 흡수.
4. 3개월 이전 요청은 clamp(에러 아님).
5. 기존 수집 회귀 없음, 오류 시 크롤 무중단.

## 5. 검증
```bash
npx tsc --noEmit && npm run lint && npm run build
ls src/lib/crawler/adapters/gdelt-news.ts
grep -n "api.gdeltproject.org\|sourcelang:korean\|ArtList\|seendate\|GDELT_ENABLED" src/lib/crawler/adapters/gdelt-news.ts
grep -n "fetchGdeltNews" src/lib/crawler/orchestrator.ts
git diff --stat origin/main
```
**라이브(배포 후 — 키 없이 바로)**
- [ ] 크롤 후 GDELT 출처(다양한 한국 매체) 기사 수집·게시
- [ ] 단일 매체 비중↓, 소스 수↑
- [ ] 중복 게시 없음

## 6. 커밋
브랜치 `agent/431-gdelt-doc` → 커밋·푸시 → 재현검증 → "커밋해" → 머지.
스테이징: `src/lib/crawler/adapters/gdelt-news.ts`(신규) · `src/lib/crawler/orchestrator.ts`(검색 병행) · 이 지시서
제외: 상시 목록(topic-covers NFD·council-bridge·성능-리전이동·골드샘플).
커밋: `feat: GDELT DOC API 수집 어댑터 — 검색 백엔드 병행(무료·키 불필요) (431)`

### 기록란 (구현자)
| 항목 | 결과 |
|---|---|
| 키 없이 동작(GDELT_ENABLED 가드) | |
| sourcelang:korean·3개월 clamp | |
| 본문 없는 stub → 보강 → 관련도 게이트 | |
| 네이버·Google 무변경 병행 | |
| 중복 흡수 | |

## 7. 다음
- **432 GDELT BigQuery 백필**(6개월 소급) — 수희 GCP 서비스계정 키 후.
- (확장) GDELT tone/theme 신호 저장.
