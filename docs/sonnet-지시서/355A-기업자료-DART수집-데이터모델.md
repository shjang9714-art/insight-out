# 지시서 355-A — 기업·기술 자료: DART 공시 수집 + 데이터 모델(토대)

> 대상: 구현 에이전트 · 상위설계 `docs/기업자료-아카이브-사전분석.md` · **신규 SQL 있음**(수희 핸드오프)
> ⚠️ 읽을 것: `supabase/schema.sql`(content_category enum·`contents`·`sources`·`crawl_logs`·`entities`/`content_entities`) · `src/lib/extract/pdf.ts`·`src/lib/contents/pdf-cover.ts`(본문·표지 재사용) · `src/components/admin/ReportUploadForm.tsx`(Storage 서명URL 패턴) · `curated_companies`(253 마이그레이션 — entity_id FK 유무 확인) · `AGENTS.md`
> ⚠️ **실험실 전용**: 이 시리즈(355-*)는 당분간 **관리자 전용(실험실)**. 사용자 표면은 355-B에서 `/dashboard/lab` 하위로 얹는다. 355-A엔 사용자 UI 없음(데이터·수집·최소 어드민만).
> 범위: 이번엔 **DART 수집 + 데이터 모델 + entity 매칭 + 최소 어드민 트리거·목록**. 탭·상세·업로드 통·IR감시는 355-B~E.

## 설계 결정 (사전분석 확정)
- 문서 = `contents(category='기업자료')` + **1:1 확장 `company_documents`**. 검색·중복·엔티티연결 인프라 공유, 문서 전용 메타 분리.
- `entities` = 캐논 기업키(문서↔기업은 `content_entities`). `curated_companies`는 분류 레이어.
- 저작권: **DART 공시는 자동공개**(공개 공시라 안전). 원문은 링크(원문 URL) 우선, 필요 시 Storage 보관.

## §0. 신규 SQL (수희 핸드오프)
`docs/sql-handoff/355A-company-documents.sql`:
1. **enum 확장** — `alter type content_category add value if not exists '기업자료';`
2. **company_documents** (content_id 1:1):
   - `content_id uuid pk references contents(id) on delete cascade`
   - `entity_id uuid references entities(id)`, `doc_type text`(회사소개/IR·실적/전략·보고서/ESG/기술·제품/투자·피치덱/행사·발표), `doc_group text`(회사및사업/기술및제품/투자및경영)
   - `is_official boolean default false`, `source_kind text`(API·RSS·SITEMAP·HTML_LIST·HTML_DETAIL·DOCUMENT_DIRECTORY·HEADLESS_BROWSER·MANUAL)
   - `page_count int`, `published_on date`, `official_status text default '공식원문링크'`, `access_scope text default 'public'`
   - `version_group_id uuid`, `prev_content_id uuid references contents(id)`, `ingest_status text default 'auto'`, `review_status text default 'none'`
   - `dart_rcept_no text unique`(공시 중복키), `created_at/updated_at`
3. **document_sources**(기업별 소스 레지스트리, 355-E 선행 토대): `id`, `entity_id`, `name`, `url`, `source_kind`, `collect_method`, `target_file_types text[]`, `interval_minutes`, `last_crawled_at`, `last_success_at`, `is_active`, `error_state text`, `auto_publish boolean default false`, `created_at/updated_at`.
4. **entity_dart_map**: `entity_id uuid`, `corp_code text`(DART 8자리 고유번호), `corp_name text`, unique(entity_id), unique(corp_code). 초기 수동 시드(대상 기업만).
5. RLS: 읽기 인증, 쓰기 service_role. 미적용(42P01) 시 어드민 graceful.
- **확인 후 기록**: `curated_companies`에 `entity_id`가 있으면 분류는 그걸로 직결, 없으면 name/alias 매핑을 `company_documents` 조회단에서 처리(둘 중 무엇을 썼는지 커밋 메시지·문서에 남길 것).

## 작업

### A. DART 커넥터 — `src/lib/company-docs/dart.ts`(신규, server-only)
- 환경변수 **`OPENDART_API_KEY`**(팀이 Vercel 환경변수에 등록 — 코드에 키 하드코딩 금지, 없으면 명확한 안내로 no-op).
- `fetchDisclosures(corpCode, since)` → OpenDART 공시목록 API(`list.json`, `corp_code`·`bgn_de`·`pblntf_ty`)로 공시 목록(rcept_no·report_nm·rcept_dt·flr_nm). 사업보고서·분기/반기보고서·주요사항보고서 유형 위주.
- 각 공시 → 문서 레코드로 정규화: `doc_type` 매핑(보고서명 → IR·실적/전략·보고서), `published_on=rcept_dt`, `is_official=true`, `source_kind='API'`, `official_status`, 원문 URL = DART 뷰어 링크(`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=…`). 원문 파일 즉시 다운로드는 필수 아님(링크 우선).
- 레이트리밋·에러는 `crawl_logs` 재사용 기록.

### B. 적재 파이프라인 — `src/lib/company-docs/ingest.ts`(신규)
- 공시 1건 → **중복검사(`dart_rcept_no` unique)** → `contents`(category='기업자료', title=report_nm, status 결정) + `company_documents` upsert → `content_entities`로 entity 연결(entity_dart_map로 매칭) → 자동공개(공시 한정).
- 실패/미매칭은 `review_status='검토대기'`.

### C. 최소 어드민(관리자 전용) — `/admin/company-documents`(신규, 최소)
- 대상 기업(entity_dart_map 등록분) 선택 + 기간 → **[DART 수집 실행]** 버튼(서버 액션/route). 결과: 신규 N·중복 N·미매칭 N.
- 최근 적재 문서 목록(기업·문서명·유형·발행일·상태). 상세·편집은 355-C.
- verifyAdmin 재사용. 크론 슬롯 연결은 후속(우선 수동 실행).

## 회귀 / 주의
- **실험실 원칙**: 사용자 대시보드(기업동향 탭)에 노출 금지. 355-A 산출물은 어드민에서만 접근.
- 42P01(테이블·enum 미적용) graceful — 크래시 금지.
- `OPENDART_API_KEY`는 **팀이 등록**(비밀키를 코드·문서에 넣지 말 것).
- 원문 저장은 링크 우선(저작권·Storage 비용). 공시 원문 zip 다운로드는 선택.
- entity 매칭 실패분은 자동공개 금지(검토대기).
- 검증: `tsc` · ESLint · `check-prefetch` · `npm run build` · (SQL 적용 후) 어드민에서 1개 기업 DART 수집 왕복. 완료보고에 커밋 해시 + 어느 기업 마스터 매핑을 썼는지 명시.

## 쪼개기
**① SQL 핸드오프 + 모델 타입 / ② dart.ts + ingest.ts / ③ 최소 어드민 트리거·목록** 3커밋. SQL 미적용 중에도 빌드·배포 안전(폴백). 커밋·푸시·배포.
