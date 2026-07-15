# 지시서 355-F — 기업자료 발견 커넥터(네이버 검색 · Tavily)

> 대상: 구현 에이전트 · 상위설계 `docs/기업자료-아카이브-사전분석.md`(부록 A) · **선행: 355-A**(company_documents·document_sources·검토대기 모델)
> ⚠️ 읽을 것: `src/lib/company-docs/ingest.ts`(355-A) · `sources`/`crawl_logs` · `docs/sql-handoff/355A-*.sql` · `AGENTS.md`
> ⚠️ **실험실 전용**(관리자). 발견 결과는 **원천이 아니라 후보** → 자동공개 금지.

## 핵심 원칙 (사전분석 부록 A)
- 발견(discovery) = 후보 URL을 찾는 것. **원천 아님** → `is_official=false`, `review_status='검토대기'`, **원문 저장 금지(링크·메타만)**. 어드민 승인 시에만 승격.
- **쿼터 가드 필수**: 네이버 앱당 일 25,000 / Tavily 월 1,000. 초과 방지 카운터·캐시.
- 키는 팀이 Vercel 환경변수 등록(`NAVER_SEARCH_CLIENT_ID`/`NAVER_SEARCH_CLIENT_SECRET`, `TAVILY_API_KEY`). 없으면 해당 provider no-op + 안내.

## 작업

### A. 공통 발견 인터페이스 — `src/lib/company-docs/discovery/types.ts`(신규)
- `interface DiscoveryProvider { key: string; search(input): Promise<Candidate[]> }`
- `Candidate = { url, title, snippet?, source_kind, entity_hint?, doc_type_hint?, published_hint?, provider }`
- `saveCandidates(entityId, candidates[])` → `document_sources`(또는 후보 테이블) + `company_documents`(link-only, 검토대기)로 적재. 중복은 URL 정규화 기준. **원문 다운로드·Storage 저장 안 함.**

### B. 네이버 검색 provider — `.../discovery/naver.ts`
- 엔드포인트: 검색 API(news·webkr). 쿼리 = 기업명 + 자료 힌트(예: `"{기업} 회사소개서"`, `"{기업} IR 자료"`, `"{기업} 기술백서"`, `"{기업} 지속가능경영보고서"`).
- 결과에서 **PDF/자료실 링크 후보** 추출(확장자·자료실 경로 휴리스틱), `doc_type_hint` 매핑. client_id/secret 헤더.
- **쿼터**: 호출 카운터(일 리셋) — 상한 근접 시 중단·로그. 캐시(같은 쿼리 24h).

### C. Tavily provider — `.../discovery/tavily.ts`
- **어드민 수동 트리거 전용**(자동 크론 금지 — 월 1,000 크레딧). 입력 = 기업 + 자유 프롬프트(예: "퓨리오사AI 회사소개서·피치덱"). Tavily search(정밀).
- 결과 → Candidate. **크레딧 카운터**(월 리셋) 상한 근접 시 차단.

### D. 어드민 연결 — `/admin/company-documents`(355-A 최소 화면 확장)
- 기업 선택 + [네이버로 후보 찾기](쿼터 표시) / [Tavily 정밀 탐색](남은 크레딧 표시) 버튼. 결과 후보 목록(제목·출처·유형힌트·URL) → [검토함으로] (검토대기 적재). 승인·유형변경은 355-C 검토함에서.
- 쿼터 현황(오늘 네이버 N/25000, 이번달 Tavily N/1000) 노출.

## 회귀 / 주의
- **자동공개 금지**: 발견 후보는 전부 검토대기. 저작권(결정 5) — 원문 저장은 승인·공식도메인 한정.
- 쿼터 초과 방어가 최우선(특히 Tavily). 크론 연결 금지(수동 트리거).
- 키 부재 시 graceful no-op. `crawl_logs` 재사용.
- 검증: `tsc` · ESLint · `check-prefetch` · `npm run build` · (키 설정 후)어드민에서 1개 기업 네이버 후보→검토대기 왕복. 완료보고 커밋 해시.

## 쪼개기
**① 공통 인터페이스+saveCandidates / ② 네이버 provider+쿼터 / ③ Tavily provider+크레딧가드 / ④ 어드민 버튼·후보목록** 4커밋. 커밋·푸시·배포.
