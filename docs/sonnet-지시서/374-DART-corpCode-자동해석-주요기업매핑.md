# 지시서 374 — DART corpCode 자동해석: 주요기업 → entity_dart_map 일괄 매핑

> 대상: 구현 에이전트 · 관리자 전용 · 선행: 355-A(entity_dart_map)·253(curated_companies) · **신규 SQL 없음**(기존 테이블 upsert)
> ⚠️ 읽을 것: `src/app/admin/company-documents/page.tsx`(DART 수집·기업 목록) · `src/lib/company-docs/dart.ts`(OPENDART 호출 패턴·`OPENDART_API_KEY` env) · `docs/sql-handoff/355A-company-documents.sql`(entity_dart_map: entity_id·corp_code unique·corp_name) · `docs/sql-handoff/253-curated-companies-그룹-프롬프트.sql`(curated_companies: name·aliases·entity_id) · `AGENTS.md`

## 배경 (David)
DART 수집 대상은 `entity_dart_map`(entity_id + 8자리 corp_code)에 등록된 기업뿐인데, 현재 2개(LG유플러스·KT)만 매핑돼 있다. **주요기업(curated_companies, 41개사)을 한 번에 매핑**하고 싶다. corp_code를 수동으로 추측하면 엉뚱한 회사 공시가 딸려와 위험 → **DART가 제공하는 corpCode 전체목록으로 이름 매칭해 정확히 자동 등록**한다. (글로벌사 AWS·MS·구글·NVIDIA·OpenAI 등은 DART 미등록 → 자동 제외됨.)

## 작업

### 1. corpCode 전체목록 로더 — `src/lib/company-docs/dart-corpcode.ts`(신규, server-only)
- OPENDART 엔드포인트: `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=<OPENDART_API_KEY>` → **ZIP** 응답(내부 `CORPCODE.xml`: `corp_code`·`corp_name`·`stock_code`·`modify_date` 다수). unzip 후 파싱.
- **캐시 필수**(파일이 수 MB·수십만 건) — 24h 캐시(메모리 또는 Storage/임시테이블). 매 요청 재다운로드 금지.
- 키 없으면(`OPENDART_API_KEY` 미설정) graceful 안내(no-op).

### 2. 매칭 + 업서트 — 어드민 액션
- `/admin/company-documents`에 **"주요기업 DART 코드 자동해석"** 버튼(verifyAdmin). 실행 시:
  - `curated_companies`(entity_id not null) 각 사의 **name·aliases**를 corpCode 목록의 `corp_name`과 **정규화 매칭**(NFC·공백/괄호/·제거·소문자, 법인격 접미 `주식회사`/`(주)` 흡수). **상장(stock_code 있음) 우선**, 동명이인 다수면 상장사 채택·나머지는 후보로.
  - 매칭되면 `entity_dart_map`에 **upsert**(entity_id=curated_companies.entity_id, corp_code, corp_name). `on conflict(corp_code)` 갱신.
  - **매칭 실패·다중후보**는 저장하지 말고 **"미매칭/후보 목록"으로 화면에 표시**(회사명 + 후보 corp_name·corp_code) → 관리자가 수동 확정(간단 선택 UI 또는 이번엔 목록 표시까지).
- 결과 요약: 자동등록 N / 미매칭 M / 글로벌·비상장 제외 K.

### 3. 안전장치
- corp_code는 `^[0-9]{8}$`만(스키마 제약과 일치). 잘못된 매칭 방지: **정확·별칭 완전일치 우선**, 부분일치는 후보로만(자동 저장 금지).
- 기존 매핑(LG유플러스·KT 등)은 덮어쓰지 않게(동일 corp_code면 no-op).

## 회귀 / 주의
- 관리자 전용(verifyAdmin). OPENDART 쿼터·과호출 방지(캐시). 신규 SQL 없음(entity_dart_map upsert).
- 글로벌·비상장·자회사(별도 공시 없음)는 미매칭이 정상 — 오류로 취급 말 것.
- 색 토큰·한국어·`prefetch={false}`.
- 검증: `tsc`·ESLint·`check-prefetch`·`build` + (키 설정 후 dev)자동해석 실행 → 상장 주요기업 다수 등록·미매칭 목록 표시·드롭다운에 반영. 완료보고에 커밋 해시.

## 배포 게이트
⚠️ main 머지·배포 금지. **전용 worktree**(`git worktree add /private/tmp/insight-out-374 -b agent/374-dart-corpcode-resolve origin/main`)에서 작업 → push+PR, 브랜치명 회신 → Opus 검증 후 머지.

## 쪼개기
① corpCode 로더+캐시 / ② 매칭·업서트·미매칭목록 어드민 액션. 2커밋.
