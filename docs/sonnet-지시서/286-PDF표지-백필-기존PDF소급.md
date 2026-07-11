# 지시서 286 — PDF 첫 페이지 표지 백필 (PDF 커버 슬라이스 B)

> 작성: Opus(플래너) · 2026-07-11 · 설계: `docs/설계-PDF표지-자동추출-커버소스-우선순위.md` §6 슬라이스 B
> 근거: 285는 **신규 업로드만** 커버를 붙인다. 이미 올라간 PDF들은 여전히 커버가 없다 → 소급 적용.
> 협업 루프: 로컬(커밋X). 위임 → 구현 → 재현검증 → "커밋".
> 전제: **285 배포됨**(`coverFromPdfFirstPage` 존재). **SQL 없음**(§2 참조 — 기존 마커 재사용).
> 후속: 슬라이스 C(수동 override UX) — 범위 밖.

---

## 0. 한 줄

이미 업로드된 PDF 중 커버가 없는 것들을 **1페이지 렌더로 소급 적용**한다. 282·265가 쓴 fresh/retry 마커 패턴을 그대로 복제한다.

---

## 1. 현행 진단 (검증된 코드 사실)

- **285 헬퍼 재사용 가능**: `src/lib/contents/cover-from-pdf.ts`의
  `coverFromPdfFirstPage(admin, contentId, pdf: Uint8Array): Promise<string|null>`
  — 렌더 → JPEG → `report-covers/{id}.jpg` upsert → `thumbnail_url` 갱신(캐시버스터 포함) → 실패 시 graceful `null`.
  **이 헬퍼를 그대로 호출하면 된다. 새로 만들지 말 것.**
- **PDF 원본 위치**: `reports` 버킷. 경로는 `contents.file_path`(`schema.sql:360` — "Supabase Storage 첨부 경로, 리포트 1:1").
  다운로드 패턴은 extract 라우트와 동일: `admin.storage.from('reports').download(filePath)` → `new Uint8Array(await fileData.arrayBuffer())`.
- **업로드 PDF의 category**: `ReportUploadForm.tsx:70` 기본 `'리포트'`(관리자가 선택).
- **282 썸네일 백필의 대상**: `THUMBNAIL_TARGET_CATEGORIES = ['뉴스','웹인사이트']`(`thumbnail-backfill.ts:6`) + `original_url IS NOT NULL`(크롤분).
- **배치 드레인 패턴**: `src/lib/contents/thumbnail-backfill.ts`의 `drainThumbnailBackfill`
  (fresh/retry 모드, batch + `remaining` 카운트, deadline, 42703 graceful). 265도 이걸 복제했다.
- 어드민 UI: `src/components/admin/AdminContentProcessing.tsx`에 282·265가 만든
  **"아직 시도 안 함 / 실패행 재시도" 2버튼 카드** 패턴이 이미 있다.

---

## 2. DB / SQL — **없음** (기존 마커 재사용)

시도 마커로 **기존 `contents.thumbnail_fetched_at`(219)을 그대로 재사용한다.** 새 컬럼을 만들지 말 것.

**근거(중요 — 충돌하지 않는 이유)**: 282의 썸네일 백필은 `category IN ('뉴스','웹인사이트')` **AND `original_url IS NOT NULL`**(크롤분)만 건드리고, 이번 PDF 백필은 **`file_path`가 있는 업로드 PDF**(`category='리포트'` 계열)만 건드린다 → **두 대상 집합이 서로 겹치지 않는다.** 같은 컬럼을 쓰되 대상이 분리돼 있어 마커가 서로를 덮지 않는다.

> 구현 시 이 사실을 코드 주석으로 남길 것. 향후 282의 대상 카테고리가 넓어지면 이 가정이 깨진다.

---

## 3. 구현

### 3-1. 신규 `src/lib/contents/pdf-cover-backfill.ts`
`drainThumbnailBackfill`(282) 구조를 그대로 복제한다.

```ts
drainPdfCoverBackfill(admin, { limit, mode, deadline }): Promise<DrainResult>
// DrainResult: { processed, filled, skipped, remaining, ready }
```

**대상 조건**
```
공통 : file_path IS NOT NULL AND file_path ILIKE '%.pdf' AND thumbnail_url IS NULL
fresh: ... AND thumbnail_fetched_at IS NULL          (아직 시도 안 함)
retry: ... AND thumbnail_fetched_at IS NOT NULL      (과거 실패행 재시도)
```

**행 처리(`processOne`)**
1. `reports` 버킷에서 `file_path`로 PDF 다운로드.
2. `coverFromPdfFirstPage(admin, id, buffer)` 호출(285 헬퍼).
3. ⚠️ **성공·실패 어느 경우든 `thumbnail_fetched_at = now()`로 반드시 마킹**한다.
   - 이게 빠지면 **커버를 못 만드는 PDF(손상·암호화·렌더 실패)를 매 회차 다시 렌더**한다.
   - 썸네일(282)은 실패해도 네트워크 요청 한 번이지만, **PDF 렌더는 CPU·메모리를 크게 먹는다** → 무한 재렌더의 대가가 훨씬 크다. 이 마킹이 이 지시서에서 가장 중요하다.
   - 다운로드 실패(파일 없음 등)도 마킹 대상.
4. `filled` / `skipped` 카운트.

**성능·안전**
- **순차 처리**(병렬 금지 — 렌더는 메모리를 크게 먹는다).
- 배치 크기를 **작게**: 기본 `limit=5`, 상한 `10`. (282는 20/30이지만 PDF 렌더는 훨씬 무겁다.)
- `deadline` 준수 — 넘기면 즉시 중단하고 `remaining` 반환.
- 42703/42P01 등 컬럼·테이블 문제 시 `ready:false`로 graceful degrade(무한 루프 금지).

### 3-2. 신규 라우트 `POST /api/admin/pdf-cover-backfill?limit=N&mode=fresh|retry`
- `src/app/api/admin/thumbnail-backfill/route.ts`와 동일 패턴(관리자 확인 → drain 호출 → 결과 반환).
- `runtime='nodejs'`, `maxDuration`은 렌더 시간을 감안해 넉넉히(예: 300). **edge 런타임 금지**(네이티브 canvas).
- `limit` 기본 5, 상한 10으로 클램프.

### 3-3. 어드민 UI (`src/components/admin/AdminContentProcessing.tsx`)
- **"PDF 표지 수집"** 카드 추가 — 282·265가 만든 **2버튼 패턴 그대로**:
  - `아직 시도 안 함`(fresh) / `실패행 재시도`(retry)
  - 진행 중 `중단` 버튼, 누적 `처리/설정/스킵` + `remaining` 표시.
- 설명 문구: "업로드된 PDF의 첫 페이지를 표지로 설정합니다. 표지가 이미 있으면 건너뜁니다."

---

## 4. 회귀 가드

- **수동 커버·기존 커버 보존**: 대상 조건에 `thumbnail_url IS NULL`이 반드시 들어갈 것. 이미 커버가 있는 PDF는 절대 덮지 않는다.
- **시도 마커 필수(§3-1.3)** — 성공·실패·다운로드실패 전부 마킹. 안 하면 무한 재렌더(CPU 폭증).
- **282와 충돌 금지**: 이번 백필은 `file_path` 있는 PDF만, 282는 `category IN ('뉴스','웹인사이트')` + `original_url`만. 대상 조건을 넓히지 말 것.
- **병렬 렌더 금지** — 메모리. 순차 + 작은 배치.
- 285의 `coverFromPdfFirstPage`를 **그대로 재사용**할 것(로직 복제 금지 — 나중에 갈라진다).
- 비PDF `file_path`(예: .docx)는 대상에서 제외(`ILIKE '%.pdf'`).
- 렌더 실패는 graceful — 배치가 통째로 죽으면 안 됨. 한 행 실패 → skipped로 세고 다음 행.

## 5. 검증 (Sonnet)

- `npx tsc --noEmit` 0 / `npx eslint` 0 / `npm run build`.
- 커버 없는 기존 PDF에 **fresh 백필** → 카드에 1페이지 표지가 뜬다.
- **같은 fresh 백필을 한 번 더 실행 → 방금 처리한 것들이 다시 안 잡힌다**(마커 작동). `remaining`이 줄어드는지 확인. **이게 핵심 검증이다.**
- 커버 렌더가 실패하는 PDF(손상 파일 등)도 `thumbnail_fetched_at`이 찍혀 **fresh에서 빠지고 retry에만 잡힌다.**
- 이미 커버가 있는 PDF는 **건드려지지 않는다**(thumbnail_url 불변).
- 282 썸네일 백필(뉴스·웹인사이트)이 이번 변경에 **영향받지 않는다**(대상 분리 확인).
- 커밋: `feat: PDF 첫 페이지 표지 백필 — 기존 PDF 소급 적용 (지시서 286)`

## 6. 후속(범위 밖)

- **슬라이스 C** — 수동 override UX("1페이지 다시 가져오기" 버튼, 커버 교체).
- 전략보고서(`ai_reports.cover_image_url`)로 확장.
- 1페이지 적합성 자동 판정(빈 표지·광고 페이지 감지).
