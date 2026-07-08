# 지시서 216 — 커버 후속 정리(편집모달 저장시점 통일 + og:image 서버 복사)

목표: 215에서 남긴 커버 관련 나눔점 2건을 정리한다.
- **A. 편집모달 커버 저장 시점 비대칭 해소**: 업로드는 즉시 DB persist, 제거는 저장 시 반영 → 저장 시점으로 통일(대칭).
- **B. URL 임포트 og:image 핫링크 제거**: 외부 이미지 URL을 그대로 저장하지 않고 `report-covers`로 서버 복사.

두 파트는 독립적. 신규 SQL/컬럼 없음.

---

## A. 편집모달 커버 저장 시점 통일

### A-1. 현행 진단 (검증된 코드 사실)
- `src/lib/contents/upload-cover.ts` `uploadCover`(215): storage 업로드 **+ `contents.thumbnail_url` DB update**를 함께 수행하고 캐시버스트 publicUrl 반환.
- `src/components/admin/AdminContentManager.tsx`
  - `handleThumbnailUpload`(≈414–437): `uploadCover(supabase, edit.id, file, ext)` 호출 → **파일 선택 즉시 DB에 thumbnail_url 기록** + 로컬 `edit.thumbnailUrl` 세팅.
  - `handleThumbnailRemove`(≈439–441): 로컬 `edit.thumbnailUrl=null`만. DB는 안 건드림.
  - `handleEditSave`(385·406): 저장 시 `thumbnail_url: edit.thumbnailUrl`를 update(+로컬 병합).
  → **비대칭**: 업로드는 즉시 persist(취소해도 남음), 제거는 저장 눌러야 반영.
- 신규 콘텐츠 폼(ReportUploadForm·TextPasteForm)은 insert **직후** 커버를 올리므로 즉시 persist가 맞음 — 유지해야 함.

### A-2. 구현
`upload-cover.ts`를 두 함수로 분리(호출부가 DB 기록 시점을 선택):
```ts
// storage 업로드만. DB update 없음. 캐시버스트 publicUrl 반환.
export async function uploadCoverFile(supabase, contentId, file: File | Blob, ext = 'jpg'): Promise<string>
// uploadCoverFile 후 contents.thumbnail_url 까지 기록(신규 폼용 즉시 persist). 기존 시그니처·동작 유지.
export async function uploadCover(supabase, contentId, file, ext = 'jpg'): Promise<string>  // = uploadCoverFile + update
```
- **AdminContentManager `handleThumbnailUpload`**: `uploadCover` → **`uploadCoverFile`**로 교체. 로컬 `edit.thumbnailUrl`만 세팅하고 DB 기록은 `handleEditSave`에 위임. → 업로드·제거 모두 "저장 시 반영"으로 대칭.
- **ReportUploadForm·TextPasteForm**: `uploadCover` **그대로 유지**(insert 직후 즉시 persist가 정상).
- PDF 자동표지(ReportUploadForm)도 `uploadCover` 유지.

### A-3. 회귀 가드
- 편집모달: 업로드→취소 시 DB `thumbnail_url` 불변 / 업로드→저장 시 반영 / 제거→저장 시 null.
- 편집모달 미리보기는 여전히 업로드 직후 새 커버로 보임(로컬 state).
- storage 파일은 종전처럼 즉시 덮어씀(upsert) — 이건 변경 없음(파일만 교체, DB 포인터는 저장 시).
- 신규 폼: 종전대로 insert 직후 커버 반영.

---

## B. URL 임포트 og:image 서버 복사

### B-1. 현행 진단 (검증된 코드 사실)
- `src/app/api/admin/import-url/route.ts`: og:image를 `thumbnailUrl`로 반환(215).
- `src/components/admin/TextPasteForm.tsx` 제출부(≈172–182): `coverFile` 없고 `coverPreviewUrl`(외부 og:image URL) 있으면 `supabase.from('contents').update({ thumbnail_url: coverPreviewUrl })` — **외부 URL 그대로 저장(핫링크)**. 원문이 핫링크 차단하면 깨짐.
- `src/app/api/admin/upload/route.ts`: service-role로 `report-covers`(공개, upsert) 업로드. 서버는 CORS 무관하게 외부 이미지 fetch 가능.

### B-2. 구현
신규 서버 라우트 `src/app/api/admin/cover-from-url/route.ts`:
- 인증+관리자 확인(`/api/admin/upload` 패턴 재사용: server client anon으로 role 확인, service-role로 스토리지 작업).
- body: `{ contentId: string, imageUrl: string }`.
- 처리: 서버에서 `fetch(imageUrl)` → `content-type`가 `image/*`인지 확인 → `arrayBuffer` → service-role로 `report-covers/{contentId}.{ext}` `upload(..., { upsert:true, contentType })` → `contents.thumbnail_url = {publicUrl}?v={ts}` update → `{ thumbnailUrl }` 반환.
- ext는 content-type(`image/png`→png, `image/webp`→webp, 기본 jpg)로 결정. 크기 상한(예: 5MB) 초과·비이미지·fetch 실패 시 4xx + 명확한 메시지.
- 전부 graceful: 서버 오류라도 예외를 던지지 않고 JSON 에러 반환.
- **TextPasteForm** 제출부: `coverFile` 없고 `coverPreviewUrl` 있을 때, 기존 직접 update 대신
  `POST /api/admin/cover-from-url { contentId: data.id, imageUrl: coverPreviewUrl }` 호출.
  - 성공: 서버가 report-covers 복사본으로 thumbnail_url 기록(핫링크 제거).
  - **실패 폴백(최소 회귀)**: 기존 동작대로 `contents.thumbnail_url = coverPreviewUrl`(외부 URL) 저장 → 최소한 og:image는 보임. 콘솔 경고. 본문 저장은 이미 성공.

### B-3. 회귀 가드
- URL 임포트 정상 경로: 상세/카드 커버가 `report-covers` 복사본 URL(우리 도메인)로 노출.
- og:image 없거나 서버 복사 실패: 폴백으로 외부 URL 저장 or 기본 표지 — 본문 저장은 항상 성공(graceful).
- 사용자가 파일을 직접 올린 경우(coverFile)엔 B 경로 안 탐(215 그대로).
- CORS 무관(서버 fetch).

---

## 검증(공통)
- `npx tsc --noEmit` 0, `npx eslint`(수정/신규 파일) 0, `npm run build` 통과.
- 변경 파일: `upload-cover.ts`, `AdminContentManager.tsx`, `TextPasteForm.tsx`, 신규 `api/admin/cover-from-url/route.ts`.

## 라이브 체크리스트
- [ ] 편집모달: 커버 업로드 후 **취소** → 목록 커버 변화 없음(DB 불변).
- [ ] 편집모달: 커버 업로드 후 **저장** → 반영. **제거 후 저장** → 기본 표지 복귀.
- [ ] 신규 폼(리포트·붙여넣기): insert 직후 커버 즉시 반영(종전 동일).
- [ ] URL 임포트: og:image가 있는 기사 가져오기 → 저장 시 커버가 **우리 도메인(report-covers)** URL로 노출(개발자도구 img src 확인).
- [ ] og:image 서버 복사 실패해도 본문 저장 성공 + 폴백 동작.

SQL 없음(기존 `contents.thumbnail_url`·`report-covers` 재사용).
