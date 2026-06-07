# 지시서 21 — 소스 CSV/TSV 대량 등록 (+ 작업계획서 정합화)

> 작성: Opus(Cowork) · 대상: 구현 에이전트(Codex) · 검증: Opus · 커밋: 구현 에이전트
> ⚠️ 작업 전 `AGENTS.md` + `src/components/admin/SourceManager.tsx`·`src/app/api/admin/upload/route.ts`(admin 인증)·`src/lib/crawler/normalize.ts`(`normalizeUrl`)·`src/lib/crawler/adapters/news-site.ts`(rss-parser)·`src/lib/types.ts`(`Source`,`source_type`) 를 읽을 것. `npm install` 먼저.
> 범위: **A 대량등록 기능 + B SQL(부분 unique 인덱스) + C 작업계획서.md 정합화.** 스키마 구조 변경·`connector_type`/`ingestion_method` 추가 없음. 지원 유형 `news_site`·`youtube_channel`만.

---

## 파트 A — 대량 등록 (`/admin/sources`)

### A-0. 공통 원칙
- 파싱/정규화/검증/중복검사/insert 로직은 **서버·lib**에 둔다(UI 컴포넌트 금지).
- 라우트는 **admin 인증**(upload 패턴), insert 는 서버 admin client. service_role client 미노출.
- **insert-only**(중복/오류 행 미등록, upsert 없음). 파일/URL/Gmail/키워드/뉴스레터/오피니언 제외.

### A-1. 서버 lib
`src/lib/sources/import.ts` · `src/lib/sources/validation.ts`:
- **파싱**: CSV/TSV 모두. CSV는 따옴표 안 쉼표·줄바꿈·CRLF·BOM 처리되는 견고한 파서(papaparse 설치돼 있으면 사용, 없으면 추가 또는 안전한 자체 파서). TSV는 탭 분할 + CRLF/BOM/빈 줄 정리.
- **헤더 판별**: 1행 셀에 알려진 컬럼명(`name,type,url,rss_url,is_active,crawl_interval_minutes`, 대소문자·공백 무시)이 하나라도 있으면 헤더로 간주 → 헤더 매핑(미지 컬럼 무시). 아니면 헤더리스.
- **헤더리스 기본 순서(5열, `url` 제외)**: `name, type, rss_url, is_active, crawl_interval_minutes`. (`url`은 헤더 모드로만 입력)
- **행 정규화·기본값**: `type` 빈값→`news_site`; `is_active` 빈값→`true`(허용 토큰 `true/false/1/0`, 그 외 오류); `crawl_interval_minutes` 빈값→`720`(양의 정수만, 비숫자 오류); `url` 비고 `rss_url` 있으면 `url`은 선택(null 허용).
- **검증 규칙**(행별 사유 수집):
  1. `name` 필수.
  2. `type` ∈ {`news_site`,`youtube_channel`}만.
  3. `rss_url` 필수 + `http`/`https` URL.
  4. **youtube_channel** 은 `rss_url` 호스트가 `www.youtube.com/feeds/videos.xml`(channel_id 쿼리) 형식이어야 함. (채널ID→feed 자동변환은 **선택**, 복잡하면 생략)
  5. **배치 내 중복**: `normalizeUrl(rss_url)` 기준 2번째 이후 → `duplicate`.
  6. **DB 중복**: `normalizeUrl` 정규화 비교로 기존 `sources.rss_url`과 겹치면 `duplicate`(미등록).
  7. **RSS/Atom 실제 fetch 검증**: 200 + rss-parser 파싱 가능 + `item`/`entry` ≥ 1. 실패 시 `error`+사유.
- **타임아웃·폭주 방지(필수)**: 배치 **최대 행수 50**(초과 시 거절), 각 fetch `AbortSignal.timeout(7000)`, **동시성 5 병렬**.

### A-2. API 라우트 `src/app/api/admin/sources/import/route.ts`
- `POST`, admin 인증, `runtime='nodejs'`·`dynamic='force-dynamic'`·`maxDuration=60`.
- 요청: `{ text: string, format?: 'csv'|'tsv'|'auto', mode: 'validate'|'commit' }`. **두 모드 모두 원본 `text`를 받아 서버에서 파싱·검증**(클라이언트가 보낸 "검증된 행" 신뢰 금지).
  - `validate`: 파싱+검증(fetch 포함)만, insert 없음 → 행별 결과 반환.
  - `commit`: 서버 재검증(필수값·배치내중복·**DB중복 재조회**) 후 통과 행만 insert. RSS fetch는 validate에서 한 결과를 신뢰해도 되나 **DB 중복은 commit 시 재검사**. insert 는 **23505 무시**(부분 unique 인덱스, 파트 B)로 원자적 중복 스킵.
- 응답: `{ rows: [{ index, name, type, rss_url, is_active, crawl_interval_minutes, status: 'success'|'duplicate'|'error', message }], summary: { success, duplicate, error } }`.

### A-3. UI
- `SourceManager.tsx`에 **"대량 등록"** 버튼 추가 → `SourceImportDialog.tsx`(신규) 오픈.
- 흐름: 텍스트 붙여넣기 → **"미리보기/검증"**(`mode:validate`) → 결과 테이블(행번호·name·type·rss_url·is_active·crawl_interval_minutes·**상태**·메시지) + 요약(성공/중복/오류 개수) → **"정상 항목만 등록"**(`mode:commit`) → 완료 후 소스 목록 새로고침.
- 상태 배지(success 녹/duplicate 노/error 빨), 로딩·한국어 에러, 50행 초과·빈 입력 안내. 차분한 토큰(AGENTS §9).

---

## 파트 B — 부분 unique 인덱스 (Codex 가 SQL → 수희 실행)
`supabase/2026-06-07-소스-rss-unique.sql`(멱등):
```sql
-- 동일 rss_url 중복 소스 방지(부분 unique). import insert 가 23505 로 중복 스킵.
create unique index if not exists sources_rss_url_key
  on public.sources (rss_url) where rss_url is not null;
```
- ⚠️ 적용 전 **기존 `sources`에 rss_url 중복이 있으면 인덱스 생성이 실패**할 수 있음 → 보고에 "기존 중복 없는지 확인 필요(수희)" 명시. **SQL 핸드오프**(수희 실행)라 먼저 커밋 가능.

---

## 파트 C — 작업계획서 정합화 (`docs/작업계획서.md`, **git만**)
> 노션 미러는 기존 batch-end 기록 동기화 루틴 소관 → **여기선 git `작업계획서.md`만** 갱신. 중복 작업 금지.
- **실제 코드/커밋과 대조해 상태를 정합화**(허위 🟢 금지 — 각 항목을 파일·커밋으로 확인 후 체크).
- 반영할 변경:
  - **#32**(line 167) ⚪→🟢: "영문 콘텐츠 **멀티프로바이더 번역 엔진**(DeepL→Papago→Google 한도 캐스케이드, `translation_usage`)+ 원문/번역 토글. [지시서19](./sonnet-지시서/19-영문-번역-적재-토글.md)" + 이 라운드 커밋 SHA.
  - **신규 #P6 번역 상태 어드민**(성능·안정화 표): `/admin/translation` 프로바이더 상태·월 사용량·on/off, 키는 env·DB 미저장. [지시서20](./sonnet-지시서/20-번역-상태-어드민.md) + SHA. SQL: `2026-06-06-번역사용량.sql`·`2026-06-06-번역설정.sql`(수희).
  - **신규 #P7 소스 CSV/TSV 대량 등록**: 본 작업. [지시서21](./sonnet-지시서/21-소스-대량등록-CSV.md) + SHA. SQL: `2026-06-07-소스-rss-unique.sql`(수희).
  - **진행 현황 메모**(상단) 날짜를 오늘(KST)로, 신규 완료 3건(번역엔진·번역상태·대량등록) bullet 추가, line 51 "다음" 문구를 현재 상태에 맞게 갱신.
- 이 정합화는 **본 작업 커밋에 포함**(별도 동기화 패스 만들지 말 것).

---

## 완료 조건
- [ ] A: lib(import/validation) 서버 분리 · 파싱(CSV/TSV·헤더유무) · 정규화/기본값 · 검증(name필수·type 2종·rss http·youtube feed형식·배치내/DB중복·RSS fetch≥1) · **50행 상한·7s 타임아웃·5병렬**
- [ ] A: `POST /api/admin/sources/import`(admin 인증, validate/commit, 서버 재검증, insert-only+23505 스킵)
- [ ] A: "대량 등록" 버튼 + `SourceImportDialog`(미리보기 테이블·상태배지·요약·등록·새로고침)
- [ ] B: `2026-06-07-소스-rss-unique.sql`(부분 unique, 멱등) + 기존중복 주의 보고
- [ ] C: `작업계획서.md` #32 🟢 + #P6·#P7 신규 + 메모/다음 갱신(코드·커밋 대조, git만)
- [ ] service_role client 미노출, 스키마 구조·`connector_type`/`ingestion_method` 불변, 크롤러/dedup/태깅 불변
- [ ] `npx tsc --noEmit` · `npm run build` · `npm run lint`(신규 0) 통과

## 보고 양식
```
## 완료 보고 — 지시서 21 소스 대량 등록 + 작업계획서 정합화
- 변경 파일: <목록>
- A 대량등록 / B SQL / C 작업계획서: <각 요약>
- SQL: supabase/2026-06-07-소스-rss-unique.sql (수희 실행 대기, 기존 rss_url 중복 여부 확인 필요)
- 작업계획서: #32 🟢 / #P6·#P7 추가 / 메모 갱신 <요약>
- 검증: tsc · build · lint
- 미해결: <없으면 "없음">
```
