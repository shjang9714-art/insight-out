# 설계 — PDF 첫 페이지 표지 자동추출 + 커버 소스 우선순위 통합

> 작성: Opus(플래너) · 2026-07-11 · 근거: David 요구 — "리서치 PDF 첫 페이지는 대개 보고서 표지이니 업로드 시 1페이지를 커버로 쓰고, 이전 업로드도 재처리 가능하게. 안 맞으면 사용자가 별도 커버를 올리게."
> 성격: **설계서(구현 아님)**. 이 문서에서 코드/동작 변경 없음. 이후 슬라이스별 지시서의 근거.
> 협업 루프: 로컬(커밋X). 위임 시 지시서로 분해 → 구현 → 재현검증 → "커밋".

---

## 0. 한 줄

업로드된 리서치 PDF의 **1페이지를 래스터 이미지로 렌더해 카드 커버로 자동 설정**하고, 크롤 og:image·생성 풀·수동 업로드를 포함한 **커버 소스 우선순위를 하나의 체인으로 정리**한다.

---

## 1. 현행 진단 (검증된 코드 사실)

### 1.1 커버 저장·필드
- 카드 커버 필드 = **`contents.thumbnail_url`**. 커버 선택 로직 단일 진입점은 `src/lib/contents/topic-cover.ts`의 `coverUrlFor(row)`:
  `return row.thumbnail_url ?? pickTopicCover({...}) ?? null` — **thumbnail_url 최우선**, 없으면 주제 매칭 생성 풀, 그것도 없으면 null(카드가 `BrandedCover` 렌더).
- 스토리지: `report-covers`(공개 버킷, `{contentId}.{ext}`, upsert) · `reports`(비공개, 원본 파일) · `public/topic-covers/`(생성 풀, 매니페스트 방식·281).
- `ai_reports.cover_image_url`(274)은 **전략보고서 전용** 커버 필드로 별개. 이 설계의 1차 대상은 `contents.thumbnail_url`(업로드 리서치/리포트 카드).

### 1.2 업로드 흐름 (파일이 서버 라우트를 안 거침)
- `POST /api/admin/upload` (`src/app/api/admin/upload/route.ts`): 관리자 확인 후 **서명된 업로드 URL(token)만 발급**. 클라이언트가 `uploadToSignedUrl`로 스토리지에 직접 업로드 → Vercel 요청 크기 한도 무관.
  - 원본: `reports` 버킷 `{safeCategory}/{year}/{uuid}.{ext}`.
  - 커버: `kind==='cover'` → `report-covers` 버킷 `{contentId}.{ext}` upsert.
- 함의: **PDF 1페이지 추출은 업로드 라우트에서 불가**(파일이 여기 안 옴). 업로드 후 별도 후처리 단계에서 `reports` 버킷에서 내려받아 렌더해야 함.

### 1.3 PDF 후처리 패턴 (재사용 대상)
- `POST /api/admin/contents/[id]/extract` (`.../extract/route.ts`): `reports`에서 PDF 다운로드(service_role) → `extractPdfText` → 번역·요약·엔티티·이슈 → `contents` 업데이트. `runtime='nodejs'`, `maxDuration=60`.
- `src/lib/extract/pdf.ts`: **`unpdf`의 `extractText`** 사용(서버리스 호환, 네이티브 의존 없음). `isScannedPdf(text)` = 텍스트 < 200자면 스캔 PDF로 판정.
- **핵심 관찰**: 스캔 PDF는 텍스트 추출은 실패(`reason:'scanned'`)해도, **1페이지 시각 이미지는 정상** → 오히려 표지 커버로 딱 맞음(현재 스캔 PDF는 본문도 커버도 없음).

### 1.4 기존 커버 자동/수동 경로
- 자동(크롤 og:image, 282): `copyExternalImageToCover(admin, id, imageUrl, {minWidth,minHeight})` (`src/lib/contents/cover-from-image.ts`) — 외부 이미지 다운로드 → 품질게이트(트래킹픽셀/저해상 배제) → `report-covers/{id}.{ext}` 업로드 → `thumbnail_url` 갱신. **`thumbnail_url`이 null일 때만** 호출(enrich-body·full-body).
- 자동(썸네일 백필): `drainThumbnailBackfill`(`thumbnail-backfill.ts`) — fresh/retry 모드, 배치 반복.
- 수동: `uploadCover`/`uploadCoverFile`(`src/lib/contents/upload-cover.ts`) — 관리자가 `report-covers/{id}`에 올리고 `thumbnail_url` 기록. 같은 경로 upsert라 `?v=` 캐시버스터로 무효화.

### 1.5 의존성
- `package.json`: `unpdf`·`pdfjs-dist` **이미 존재**(텍스트 추출용). **canvas 백엔드(`@napi-rs/canvas` 등)·`sharp`는 없음** → 페이지를 이미지로 **렌더**하려면 추가 필요.

---

## 2. 목표

1. 업로드된 PDF의 **1페이지 → 커버 이미지 자동 설정**(수동 커버·기존 커버가 없을 때만).
2. **이전 업로드 PDF 재처리**(백필) — 커버 없는 기존 PDF에 소급 적용.
3. 1페이지가 부적합하면 **관리자가 별도 커버 업로드로 override**(기존 `uploadCover` 재사용) + 재추출 트리거.
4. 위를 포함해 **커버 소스 우선순위를 단일 체인으로 명문화**.

---

## 3. 커버 소스 우선순위 (통합)

`thumbnail_url` 하나에 여러 소스가 기록되므로, "누가 언제 쓰는가"를 우선순위로 못박는다. 상위가 있으면 하위는 **덮지 않는다**(자동은 항상 `thumbnail_url IS NULL` 가드).

| 우선 | 소스 | 저장 | 적용 대상 | 트리거 |
|---|---|---|---|---|
| 1 | **수동 관리자 커버** | `thumbnail_url`(report-covers) | 전체 | 관리자 업로드(항상 override, 자동이 못 덮음) |
| 2 | **PDF 1페이지**(신규) | `thumbnail_url`(report-covers) | 업로드 PDF(리서치/리포트) | 업로드 후처리 + 백필 |
| 3 | **og:image**(282) | `thumbnail_url`(report-covers) | 크롤 뉴스·웹인사이트 | enrich/full-body·썸네일 백필 |
| 4 | **생성 주제 풀**(281) | 런타임(비저장) | 매칭되는 전체 | `pickTopicCover` 런타임 |
| 5 | **BrandedCover** | 비저장 | 전체 | 카드 컴포넌트 최종 폴백 |

- 2·3은 둘 다 "`thumbnail_url` null이면 채움"이라 **대상 콘텐츠 유형이 달라 충돌 없음**(PDF 업로드 vs 크롤). 
- "안 맞으면 별도 커버" = 우선순위 1이 2를 덮는 것으로 자연 해결(관리자 override).

---

## 4. 기술 설계

### 4.1 신규 헬퍼 `src/lib/contents/cover-from-pdf.ts`
```
coverFromPdfFirstPage(admin, contentId, pdfBuffer, opts?) → publicUrl | null (graceful)
```
- 입력: `reports`에서 받은 PDF `Uint8Array`.
- 처리: 1페이지를 래스터 이미지로 렌더(§4.3) → JPEG 인코딩(품질/폭 제한) → `report-covers/{contentId}.jpg` 업로드(upsert) → `contents.thumbnail_url` 갱신(`?v=` 캐시버스터).
- 282의 품질게이트 개념 재사용 여지(페이지 렌더는 고해상이라 최소해상 게이트는 사실상 통과; data/svg 게이트는 불필요).
- 실패 시 throw 없이 null(생성 풀 폴백 유지).

### 4.2 훅 지점
- **(a) 업로드 후처리**: PDF 업로드→`extract` 호출 흐름에 커버 단계 추가. `extract` 라우트 안에서 다운로드한 동일 버퍼를 재사용해 `coverFromPdfFirstPage` 호출(추가 다운로드 없음). `thumbnail_url`이 이미 있으면(수동/기존) 스킵.
  - 대안: 별도 라우트 `POST /api/admin/contents/[id]/pdf-cover`로 분리(관심사 분리, 재시도 용이). extract와 커버는 실패 독립이 바람직 → **분리 권장**(단, 공통 다운로드 1회를 위해 extract가 성공 시 커버도 함께 트리거하되 try/catch 독립).
- **(b) 백필**: `POST /api/admin/pdf-cover-backfill?limit=N&mode=fresh|retry` — `thumbnail-backfill` 패턴 복제. 대상: `file_path LIKE '%.pdf'` AND `thumbnail_url IS NULL`(fresh) / 과거 실패행(retry). 배치 반복·remaining 카운트. 어드민 UI(콘텐츠 유지보수/표지자산)에서 버튼.
- **(c) 수동 override**: 기존 `uploadCover`. 추가로 "1페이지 다시 가져오기" 버튼(단일 콘텐츠 재추출) 제공.

### 4.3 렌더 방식 — **결정 포인트(포크)**
| 옵션 | 내용 | 장 | 단 |
|---|---|---|---|
| **A. `unpdf.renderPageAsImage` + `@napi-rs/canvas`** (추천) | unpdf가 이미 의존성. `renderPageAsImage(buf, 1, { canvas: () => import('@napi-rs/canvas') })` | 신규 표면 최소, 서버리스 검증된 prebuilt 네이티브 canvas(Vercel Node 런타임 호환), 텍스트 추출과 동일 라이브러리 | canvas 네이티브 의존 1개 추가(번들·콜드스타트 소폭) |
| B. `pdfjs-dist` 직접 + canvas | 저수준 제어 | 세밀 제어 | 코드량↑, 동일 canvas 필요, 유지비↑ |
| C. 외부 렌더 서비스 | 별도 서비스 | 서버 부하 오프로드 | 과함·비용·지연, 불필요 |

→ **A 권장.** `@napi-rs/canvas`는 Vercel Node 런타임에서 동작하는 prebuilt 바이너리. maxDuration 60·nodejs 런타임 이미 확보.

### 4.4 출력 규격(초안)
- 폭 상한 ~1000–1200px(카드/상세 충분), JPEG 품질 ~80, 파일 `report-covers/{id}.jpg`.
- 페이지 종횡비 유지(표지 세로형 다수). 카드 크롭은 CSS(object-cover) 기존대로.

---

## 5. 회귀 가드

- **수동 커버 보존**: 자동(PDF·og:image)은 반드시 `thumbnail_url IS NULL`에서만. 관리자 커버를 절대 덮지 않음.
- **스캔 PDF**: 텍스트 추출 실패(`reason:'scanned'`)와 **독립적으로** 커버는 시도(오히려 유효). 커버 실패해도 본문 처리 흐름 안 깨짐(try/catch 분리).
- **graceful**: 렌더/업로드 실패 시 null → 생성 풀·BrandedCover로 자연 폴백. 예외 전파 금지.
- **Vercel 제약**: 대용량/다페이지 PDF에서 1페이지만 렌더(전체 로드 최소화). maxDuration·메모리 관측 필요(큰 PDF 페이지 렌더 메모리). 실패시 백필 retry로 흡수.
- **비PDF/이미 커버 있음**: 조기 스킵.
- **캐시**: upsert 동일 경로 → `?v=` 캐시버스터 필수(기존 규약 준수).
- **권한**: 신규 라우트도 `users.role==='admin'` 재확인(미들웨어 의존 금지).

---

## 6. 슬라이스 분해 (지시서 후보)

1. **슬라이스 A — 렌더 헬퍼 + 단건 적용**: `@napi-rs/canvas` 추가, `cover-from-pdf.ts`, extract 성공 시 커버 트리거(독립 try/catch), `thumbnail_url` null 가드. (핵심·기술 포크 확정 필요 → 먼저.)
2. **슬라이스 B — 백필 엔드포인트 + 어드민 버튼**: `pdf-cover-backfill`(fresh/retry) + UI. (썸네일 백필 패턴 복제.)
3. **슬라이스 C — 수동 override UX**: 콘텐츠 검수 화면에 "1페이지 다시 가져오기" + 커버 교체(기존 `uploadCover`) 노출·상태 표시.

의존: A → B·C. A에서 렌더 방식(포크 §4.3) 결정 필수.

---

## 7. 범위 밖(후속)

- **전략보고서(`ai_reports.cover_image_url`)** 표지: 같은 PDF-1페이지·AI생성(나노바나나) 아이디어를 별도 커버 필드에 적용(276/전략보고서 레인과 통합). 이 문서는 `contents.thumbnail_url` 1차.
- 다페이지 썸네일·PDF 프리뷰 뷰어.
- OCR(스캔 PDF 본문) — 커버와 무관, 별개 백로그.
- 1페이지 자동 적합성 판정(빈 표지/광고 페이지 감지) — 초기엔 관리자 override로 흡수, 후속에 휴리스틱.
