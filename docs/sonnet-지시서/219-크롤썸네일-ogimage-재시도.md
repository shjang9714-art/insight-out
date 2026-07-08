# 지시서 219 — 크롤 썸네일 og:image 재시도(벌크 op)

목표: 크롤 콘텐츠(뉴스/웹인사이트) 중 `thumbnail_url`이 비어 있는 건에 대해 원문 페이지의 **og:image**를 재수집해 `report-covers`에 저장한다. `풀본문 채우기`(body-backfill)와 동일한 벌크 op 패턴을 따르고, 216 `cover-from-url` 로직을 재사용한다.

범위(David): 어드민 2차 후속 #3. **SQL 핸드오프 있음**(`docs/sql-handoff/219-thumbnail-fetched-at.sql` — 먼저 푸시·수희 적용).

---

## 1. 현행 진단 (검증된 코드 사실)

### 크롤 썸네일은 RSS 메타만, og:image 미사용
- `src/lib/crawler/orchestrator.ts:434`: insert 시 `thumbnail_url: item.thumbnail_url ?? null`.
- `src/lib/crawler/adapters/news-site.ts:44–50` `extractThumbnail`: RSS `enclosure`·`media:content`·`media:thumbnail`만 읽음. **페이지 og:image는 안 봄** → RSS에 미디어 없으면 `thumbnail_url = NULL`.

### og:image 추출 수단(재사용)
- 라이브러리 `@extractus/article-extractor`. `src/app/api/admin/import-url/route.ts:74–95`: `const art = await extract(resolved, {}, { signal: AbortSignal.timeout(8000) })` → `art.image`(= og:image). 별도 재사용 함수는 없음(각자 inline).

### 216 cover-from-url(재사용)
- `src/app/api/admin/cover-from-url/route.ts`: `{contentId, imageUrl}` → 서버 fetch(8s·content-type 검증·5MB) → `report-covers/{contentId}.{ext}` upsert → `thumbnail_url = {publicUrl}?v={ts}`. 이 fetch→업로드→갱신 로직을 재사용.

### 벌크 op 패턴(미러링 대상: 풀본문 채우기)
- UI: `src/components/admin/AdminContentProcessing.tsx:58–90`(`handleEnrich`) — while 루프로 `/api/admin/body-backfill?limit=30&from&to` 반복 호출, `{processed, improved, skipped, remaining}` 누적·표시, 시작/중단 토글.
- API: `src/app/api/admin/body-backfill/route.ts` — `verifyAdmin()` → `createAdminClient()` → `drainBackfill(admin,{limit,from,to})`.
- drain: `src/lib/contents/enrich-body.ts:157–198` `drainBackfill` — **`body_fetched_at` 마커**로 대상 필터(`.is('body_fetched_at', null).not('original_url','is',null)`), 배치 처리 후 `remaining` 계산, 0이면 종료.

### 데이터
- `contents`: `original_url`(크롤 시 채워짐), `thumbnail_url`(NULL 다수), `collected_at`, `category`.
- **마커 컬럼 없음** → 재시도 시 og:image 없는 기사가 매번 재선택돼 drain이 종료 안 됨. **`thumbnail_fetched_at` 신규 컬럼 필요**(SQL 핸드오프 219).
- 기존 썸네일 백필/재시도 코드 없음.

---

## 2. 구현

### 2-0. SQL 선적용(핸드오프)
`docs/sql-handoff/219-thumbnail-fetched-at.sql` 먼저 푸시 → 수희 적용. `contents.thumbnail_fetched_at timestamptz`(null=미시도) + 부분 인덱스.

### 2-1. 공유 이미지 복사 헬퍼(216 재사용 정리)
`src/lib/contents/cover-from-image.ts` 신설:
```ts
// 외부 이미지 URL을 서버에서 받아 report-covers/{contentId}.{ext} 로 업로드하고
// thumbnail_url 을 갱신. 성공 시 publicUrl, 실패 시 null(graceful). admin=service-role 클라이언트.
export async function copyExternalImageToCover(
  admin: SupabaseClient, contentId: string, imageUrl: string,
): Promise<string | null>
```
- 로직: URL 검증 → `fetch`(8s 타임아웃) → content-type 화이트리스트(jpeg/png/webp/gif) → 5MB 상한 → `admin.storage.from('report-covers').upload(`${contentId}.${ext}`, buf, {upsert:true, contentType})` → `thumbnail_url = {publicUrl}?v={Date.now()}` update → publicUrl 반환. 어떤 실패도 throw 없이 null 반환(로그만).
- **216 `cover-from-url/route.ts` 리팩터**: 위 헬퍼를 호출하도록 정리(동작 동일, 중복 제거). 실패 시 라우트는 기존처럼 적절한 4xx/5xx JSON 반환.

### 2-2. drain 모듈
`src/lib/contents/thumbnail-backfill.ts` 신설:
```ts
export async function drainThumbnailBackfill(
  admin: SupabaseClient, { limit = 10, from, to, deadline }: DrainOptions = {},
): Promise<{ processed: number; filled: number; skipped: number; remaining: number }>
```
- 대상 쿼리: `contents.select('id, original_url')`
  `.in('category', ['뉴스','웹인사이트']).is('thumbnail_url', null).is('thumbnail_fetched_at', null).not('original_url','is',null)`
  (+ from/to는 `collected_at` 범위) `.order('collected_at',{ascending:false}).limit(limit)`.
- 각 행:
  1. `const art = await extract(original_url, {}, { signal: AbortSignal.timeout(8000) })`(실패/타임아웃 graceful).
  2. `art?.image` 있으면 `copyExternalImageToCover(admin, id, art.image)` → 성공 시 `filled++`, 아니면 `skipped++`.
  3. **항상** `thumbnail_fetched_at = new Date().toISOString()` update(성공·실패 무관 → 무한 재시도 방지).
- `remaining` = 남은 대상 count. deadline/limit 기반 종료. 배치 limit은 **10**(행마다 페이지 추출+이미지 다운로드라 느림).
- **42703 graceful**: `thumbnail_fetched_at` 컬럼 미적용이면 쿼리/업데이트가 42703 → drain이 `{processed:0, ..., remaining:-1}` 같은 신호 또는 명시 에러로 반환해 UI가 "219 SQL 적용 후 사용 가능"을 안내(무한 루프 금지).

### 2-3. API 라우트
`src/app/api/admin/thumbnail-backfill/route.ts`(body-backfill 미러):
```ts
export async function POST(request: NextRequest) {
  const denied = await verifyAdmin(); if (denied) return denied
  const sp = request.nextUrl.searchParams
  const limit = Math.min(Math.max(parseInt(sp.get('limit')||'10',10)||10,1),20)
  const admin = createAdminClient()
  const result = await drainThumbnailBackfill(admin, { limit, from: sp.get('from'), to: sp.get('to') })
  return NextResponse.json(result)
}
```

### 2-4. UI — AdminContentProcessing에 박스 추가
기존 박스 패턴(214의 `p-5`·`admin-card-title`·outline 버튼)으로 4번째 박스 "썸네일 재시도(og:image)" 추가:
- `handleEnrich`와 동일한 while 루프 핸들러 `handleThumbnailRetry`(엔드포인트만 `/api/admin/thumbnail-backfill`, 카운터 `filled`).
- 시작/중단 토글, 진행 문구 "채우는 중… 누적 처리 N · 성공 M", 완료 시 "완료 · 처리 N · 성공 M · 스킵 S".
- 42703(remaining 신호/에러) 시 "219 SQL 적용이 필요합니다" 안내 표시.
- 설명: "썸네일이 없는 크롤 뉴스·웹인사이트의 원문 og:image를 다시 받아옵니다."

---

## 3. 회귀 가드
- **무한 루프 없음**: `thumbnail_fetched_at`로 1회 시도 후 제외 → drain이 반드시 종료.
- **기존 크롤·상세·표시 불변**: 마커 컬럼은 신규, insert 경로 무변경. 썸네일 없으면 여전히 BrandedCover(211).
- **216 cover-from-url 동작 동일**(헬퍼 리팩터 후 파리티).
- **graceful**: og:image 없음/추출 실패/이미지 다운로드 실패 모두 본문·행 안 깨지고 skip. SQL 미적용 시 op만 degrade.
- 배치 limit 작게(10) + 8s 타임아웃 → 서버 부하·행오프 방지.
- `report-covers`·`thumbnail_url`·`@extractus/article-extractor` 모두 기존 자산 재사용.

## 4. 검증
- `npx tsc --noEmit` 0, `npx eslint`(수정/신규) 0, `npm run build`(신규 라우트 등록 확인).
- SQL 42703 graceful: 컬럼 미적용 상태에서 op 실행 시 무한 루프 없이 안내로 degrade하는지.

## 5. 라이브 체크리스트(수희 SQL 적용 후)
- [ ] content-data 화면에 "썸네일 재시도" 박스 표시.
- [ ] 실행 → 썸네일 없던 뉴스/웹인사이트 일부가 og:image 커버로 점등(목록/상세 확인, report-covers URL).
- [ ] og:image 없는 기사는 skip + `thumbnail_fetched_at` 기록 → 재실행 시 재대상 아님(remaining 감소·종료).
- [ ] 중단 버튼 동작.
- [ ] 216 편집모달/URL 임포트 커버 정상(회귀 없음).

SQL: `docs/sql-handoff/219-thumbnail-fetched-at.sql`(수희 적용, 42703 graceful).
