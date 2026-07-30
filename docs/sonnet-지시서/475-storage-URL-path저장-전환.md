# 지시서 475 — storage 절대 URL → 버킷 상대 path 저장 전환

**SQL 0 · env 0 · 의존성 0.** 브랜치 `agent/475-storage-path`.

## 배경
`getPublicUrl()`의 **절대 URL을 DB에 저장**해 왔다. 7월 리전 이동(시드니→서울)에서 이 URL들이 구 프로젝트 호스트를 그대로 가리켜 **705건이 깨졌다**(474 SQL로 복구 완료 — `contents.thumbnail_url` 704 · `briefings.audio_url` 1).
구조를 안 바꾸면 **다음 이동에서 그대로 재발**한다.

## 방침 — 컬럼 추가 없이 혼재 허용 + 판별
컬럼(`thumbnail_url`·`audio_url`·`cover_image_url`)에는 3종이 섞인다: ① 기존 절대 URL(레거시) ② 크롤 og:image **외부 URL 폴백** ③ (신규) 버킷 상대 path.
→ **신규 컬럼 금지(SQL 0).** 저장은 path로, 읽기는 단일 함수가 판별한다.

1. **신규 `src/lib/storage/resolve-url.ts`**
   ```
   export function resolveStorageUrl(value: string | null): string | null
   // null/'' → null
   // /^https?:\/\//  → 그대로 반환 (레거시 절대 URL · 외부 URL 폴백 — 하위호환)
   // 그 외          → `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${value}`
   ```
   - `NEXT_PUBLIC_` prefix라 서버·클라이언트 양쪽에서 동작한다.
   - ⚠️ **이름 충돌 주의**: 기존 `src/lib/crawler/resolve-url.ts`(구글뉴스 URL 디코드)와 **다른 파일**이다. 혼동·병합 금지.

2. **저장부 4곳 — `getPublicUrl()` 제거, `{bucket}/{path}` 문자열 저장**
   - `src/lib/contents/cover-from-pdf.ts:103`
   - `src/lib/contents/upload-cover.ts:28`
   - `src/lib/contents/cover-from-image.ts:158`
   - `src/lib/tts/synthesize-briefing.ts:418`
   - 캐시버스터는 유지한다 — path 뒤에 그대로 붙여 저장(`report-covers/{id}.jpg?v=…`). 조립 시 이어지므로 동작 동일.

3. **읽기부 — 반드시 단일 함수 경유. 컴포넌트에서 직접 조립 금지.**
   - 커버: `src/lib/contents/topic-cover.ts`의 `coverUrlFor()`가 `thumbnail_url`을 반환하는 지점에 `resolveStorageUrl()` 적용(폴백 체인 순서는 불변).
   - 오디오: `briefings.audio_url` 소비처가 4곳(`BriefingManager`·`BriefingArchive`·`FloatingBriefingMini`·`MorningBriefingPlayer`)이다. **컴포넌트마다 고치지 말고 조회·전달 계층에서 한 번 변환**해 내려준다.

4. **[보완] 업로드 후 존재 검증** — `cover-from-pdf.ts`의 `ok:true`가 지금은 업로드·update 성공만 본다. `getPublicUrl`은 읽기 가능 여부와 무관하게 URL을 만든다.
   → 업로드 직후 `admin.storage.from('report-covers').list()` 또는 HEAD로 **객체 존재를 확인**하고, 실패 시 `thumbnail_url`을 **기록하지 않는다**(주제 커버 폴백이 살아 있어야 한다).

## 완료조건
- **레거시 절대 URL 행 렌더 회귀 0**(하위호환) · **외부 URL 폴백 그대로 동작** · 신규 저장분은 path 형식
- 커버·오디오 양쪽 실동작 확인 · `resolveStorageUrl` 미경유 소비 지점 0
- tsc/lint/build

## 재현검증
`getPublicUrl` 잔존 0건(grep) · 소비 지점이 전부 단일 함수 경유 · `/^https?:\/\//` 분기가 레거시·외부 URL을 건드리지 않음 · `crawler/resolve-url.ts` 무변경.
