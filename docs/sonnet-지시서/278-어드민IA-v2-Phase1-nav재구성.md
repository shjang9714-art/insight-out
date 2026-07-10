# 지시서 278 — 어드민 IA v2 Phase 1: nav 그룹·라벨 재구성 (백엔드 무변경)

> 설계: `ADMIN_RESTRUCTURE_PLAN.md` + David v2 반영 지침. **Phase 1은 nav grouping·label·description·sidebar active/open·Danger Zone 시각분리·대시보드 사용자 KPI만.** 신규 route/DB/API **생성 금지**. 기존 route 전부 유지.

대상: `src/lib/admin/nav.ts`(그룹 정의), `src/components/admin/AdminSidebar.tsx`(active/open·요청 배지), `src/app/admin/content-data/page.tsx`(Danger Zone), `/admin` 대시보드 KPI 컴포넌트(`AdminOpsSignals` 등).

---

## 1. 최종 8개 그룹 (`nav.ts` ADMIN_NAV_GROUPS 재작성)
현재는 ADMIN_NAV_GROUPS(7그룹) + ADMIN_NAV_BOTTOM(접이식 '시스템': requests/users/content-data/settings)로 나뉘어 있다. **8개 그룹으로 평탄화**하고 아래로 재배치한다. (route·icon은 기존 것 재사용, 라벨·설명·그룹만 변경.)

**1) 운영센터**
- `/admin` — **운영 대시보드** — "전체 운영 현황, 사용자 수, 콘텐츠 상태, AI/발행 상태를 요약한다."
- `/admin/requests` — **운영 게시판** — "운영 요청, 작업 메모, 공지, 핸드오프를 관리한다."

**2) 수집·크롤링**
- `/admin/sources` — **소스 관리** — "뉴스, 유튜브, 리포트 등 콘텐츠 수집 소스를 등록하고 관리한다."
- `/admin/crawl-logs` — **크롤 실행 로그** — "소스별 크롤 성공/실패, 수집량, 중복, 오류를 확인한다."
- `/admin/exclusion-rules` — **제외 규칙** — "수집 제외 도메인, 키워드, URL 규칙을 관리한다."

**3) 콘텐츠·분류**
- `/admin/contents` — **콘텐츠 검수** — "수집·업로드된 콘텐츠의 상태, 품질, 발행 여부를 검수한다."
- `/admin/upload` — **콘텐츠 추가** — "리포트 업로드, 텍스트 붙여넣기, URL 가져오기로 콘텐츠를 수동 등록한다."
- `/admin/content-data` — **콘텐츠 데이터 보강** — "본문, 썸네일, 시그널, URL, 클러스터 등 콘텐츠 메타데이터를 보강한다."
- `/admin/keywords` — **키워드** — "콘텐츠 서비스/카테고리 분류 기준 키워드를 관리한다."
- `/admin/keyword-groups` — **키워드 그룹·시그널 기준** — "수집 seed, 검색 seed, include/exclude pattern, 시그널 기준을 관리한다."
- `/admin/entities` — **엔티티 사전** — "기업, 조직, 인물 등 엔티티와 별칭, 정규화 기준을 관리한다."

**4) AI 운영**
- `/admin/llm` — **LLM 관리** — "LLM 공급자, 사용량, 모델, 라우팅 상태를 확인한다."
- `/admin/translation` — **번역 관리** — "번역 공급자 상태와 번역 사용량을 확인한다."

**5) 인사이트·리서치**
- `/admin/issues` — **이슈 관리** — "주요 이슈 클러스터와 관련 콘텐츠 매칭을 관리한다."
- `/admin/insights` — **인사이트 카드** — "AI가 생성한 인사이트 카드의 생성, 검수, 발행 상태를 관리한다."
- `/admin/key-insights` — **핵심 Insight** — "주간 핵심 Insight를 검수, 편집, 발행한다."

**6) 발행·구독**
- `/admin/briefings` — **모닝브리핑** — "데일리 브리핑, TTS 오디오, 하이라이트 생성 상태를 관리한다."
- `/admin/newsletter` — **뉴스레터** — "뉴스레터 발행, 설정, 수신자, 구독자, 발송 이력을 통합 관리한다."

**7) 사용자·분석**
- `/admin/users` — **사용자 관리** — "사용자 승인 상태, 역할, 부서, 팀 정보를 관리한다."

**8) 시스템 설정**
- `/admin/settings` — **시스템 설정** — "홈 화면 섹션, 어드민 화면 설정, 수집 설정 등 시스템 설정을 관리한다."

> 위 목록이 **Phase 1의 전체 메뉴**다. Phase 2/3 후보(작업 모니터·장애로그·소스품질·수집설정·프롬프트·AI작업·전략리서치·경쟁사주간·큐레이션기업·분석·홈구성·서비스카탈로그·유지보수 등)는 **nav에 추가하지 말고** 코드 주석 TODO 또는 `ADMIN_RESTRUCTURE_PLAN.md` 문서로만 남긴다.

## 2. 라벨 변경 요약
- `대시보드` → `운영 대시보드`
- `크롤링 현황` → `크롤 실행 로그`
- `콘텐츠 관리` → `콘텐츠 검수`
- `콘텐츠 데이터 관리` → `콘텐츠 데이터 보강`
- `카테고리 분류기준` → `키워드`
- `수집 키워드` → `키워드 그룹·시그널 기준`
- `번역` → `번역 관리`
- `AI 인사이트` → `인사이트 카드`
- `핵심 Insight 검수` → `핵심 Insight`
- (유지) 운영 게시판·소스 관리·제외 규칙·콘텐츠 추가·엔티티 사전·LLM 관리·이슈 관리·모닝브리핑·뉴스레터·사용자 관리·시스템 설정

## 3. 구조 재편 (nav.ts + AdminSidebar.tsx)
- **ADMIN_NAV_BOTTOM(접이식 '시스템') 해체**: 그 안의 requests→운영센터, users→사용자·분석, content-data→콘텐츠·분류, settings→시스템 설정으로 이동. 8그룹을 **동일한 최상위 그룹으로 렌더**(별도 접이식 하단 특수처리 제거 또는 무해화).
- **요청 수 배지 유지**: 현재 `/admin/requests`에 붙던 열린 요청 카운트 배지(`GET /api/admin/requests/count`)를 **운영센터의 운영 게시판 항목**에 그대로 표시.
- `findAdminNavItem()`은 `[...ADMIN_NAV_GROUPS.flatMap(...), ...ADMIN_NAV_BOTTOM.items]`를 참조 → 구조 변경에 맞춰 갱신(모든 항목이 조회되도록).

## 4. Sidebar active/open 보정
아래 route 전부 새 그룹에서 **active(현재 경로 강조) + 그룹 표시가 정상**이어야 한다(`isActive`는 정확일치 또는 `href + '/'` prefix):
`/admin`, `/admin/requests`, `/admin/sources`, `/admin/crawl-logs`, `/admin/exclusion-rules`, `/admin/contents`, `/admin/upload`, `/admin/content-data`, `/admin/keywords`, `/admin/keyword-groups`, `/admin/entities`, `/admin/llm`, `/admin/translation`, `/admin/issues`, `/admin/insights`, `/admin/key-insights`, `/admin/briefings`, `/admin/newsletter`, `/admin/users`, `/admin/settings`.
- 기존 `SYSTEM_PATH_PREFIXES`(= `/admin/requests`,`/admin/users`,`/admin/settings`)에 의존하던 자동열림/활성 로직을 **8그룹 평탄화에 맞게 갱신하거나 제거** — `/admin/content-data` 포함 어떤 route에서도 active가 숨지 않도록(감사 §2 버그 해소).

## 5. 콘텐츠 상세 route 제외
- `/admin/contents/[id]`는 **nav에 넣지 않는다**(현재도 없음 — 유지). 사이드바 **검색 결과에도 메뉴처럼 노출하지 않는다**(검색은 nav 항목만 대상이므로 자동 충족, 회귀만 확인). 접근은 콘텐츠 목록·이슈·보고서·검색의 **detail link로만**.

## 6. `/admin/content-data` 위험 작업 시각 분리 (Danger Zone)
- `AdminDataReset`(purge: `POST /api/admin/contents/purge`, `POST /api/admin/youtube/purge`)를 **"위험 구역 (Danger Zone)"** 섹션으로 시각 분리 — 구분 보더·경고색, 기본 접힘, 명시적 확인 문구. 보강 작업(`AdminContentProcessing`)은 위에 그대로. **동작·API 불변, UI 분리만.**

## 7. 운영 대시보드 사용자 수 KPI
- `/admin` 대시보드(`AdminOpsSignals` 등 KPI 영역)에 **전체 사용자 수 KPI** 추가(표시 전용, 기존 count 쿼리 패턴 재사용). 승인대기 수는 기존 유지, 총 사용자 수를 KPI로 노출.

## 8. 이번 Phase 1에서 하지 말 것
- 신규 route/DB 테이블/API 생성 금지. 뉴스레터 탭 구조 대개편·전략리서치·AI job system·큐레이션 기업 화면 구현 **금지**(문서/TODO만). 뉴스레터는 `/admin/newsletter` 단일 유지, 그룹만 `발행·구독`.

## 9. 회귀 가드
- 모든 기존 route 정상 동작(404 없음). 각 항목 클릭 시 해당 화면 로드.
- 요청 수 배지 정상. content-data active 정상.
- Danger Zone 분리 후 purge/보강 동작 불변.
- 다크/라이트·반응형 사이드바 정상.

## 10. 검증 (Sonnet)
- `npx tsc --noEmit` 0 / `npx eslint` 0 / `npm run build`.
- 8그룹·새 라벨·설명 렌더, 20개 route active/open 정상, 요청 배지 유지, content-detail 메뉴 미노출, Danger Zone 분리, 대시보드 사용자 수 KPI.
- 커밋: `refactor: 어드민 IA v2 Phase 1 — nav 그룹·라벨 재구성 + Danger Zone + 사용자 KPI (지시서 278)`.

## 11. 완료 보고 (아래 12개 명시)
1) 변경한 nav 그룹, 2) 각 그룹 route, 3) 변경 메뉴명, 4) 뉴스레터가 `발행·구독`에 단일 배치됐는지, 5) 키워드/키워드그룹/엔티티가 `콘텐츠·분류`에 함께인지, 6) 크롤 실행 로그가 `수집·크롤링`으로 이동됐는지, 7) 큐레이션 기업이 시스템설정 아닌 Phase 3 `콘텐츠·분류` 후보로 문서화됐는지, 8) 콘텐츠 상세가 메뉴 제외됐는지, 9) `/admin/content-data` 위험작업 분리 여부, 10) 사용자 수 KPI 반영 여부, 11) build/typecheck 결과, 12) Phase 2/3 추천 작업.

SQL/신규 API 없음. 이 지시서는 어드민 IA v2 Phase 1(nav·라벨·active·Danger Zone·KPI).
