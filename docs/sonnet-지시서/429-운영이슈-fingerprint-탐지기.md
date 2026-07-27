# 지시서 429 — 운영 이슈 fingerprint 탐지기 (Phase 2)

> 작성: 플래너(Opus) · 2026-07-24 · 통합개선안 §8.5·§8.6 · 428 후속
> 선행: **SQL `429-ops_issues-table-...sql`(수희) 적용 후 반영.** (테이블 없으면 런타임 실패) · base 에 **428(일일 브리핑)** 포함.
> 협업 루프: 검증용 브랜치 `agent/429-ops-issues`(from `origin/main`) → 재현검증 → "커밋해" → 머지.
> 번호: 429 · git author David(yjhead@gmail.com) · **SQL은 별도 핸드오프**(코드에선 스키마 무변경).

---

## 0. 한 줄
반복 에러(크롤 실패·크론 실패·사용량 한도·보강 지연)를 **fingerprint 로 하나의 `ops_issues` 로 묶어** 지속 관리하고, 조건이 사라지면 **자동 해결**한다. 일일 브리핑 ①섹션이 이 이슈를 읽는다(100회 발생 → 1개).

---

## 1. 착수 전 확인
- 테이블 `ops_issues`(수희 SQL): `fingerprint(unique)`, category, severity, status, title, suspected_cause, recommended_action, impact, occurrence_count, first/last_seen_at, resolved_at, …
- 에러 소스: `job_runs`(job_key, status∈running/succeeded/failed/skipped, error), `crawl_logs`(source_id, status, error_message), 사용량(`llm_usage`/`translation_usage`/`tts_usage` vs 캡 — 417 `getProviderKeyCount` 로직), 보강 백로그(`contents` pending & body_fetched_at null).
- **428**(`src/lib/ops/daily-brief.ts`·`ops-brief` 크론) 이미 있음 → 이번엔 ①섹션을 ops_issues 기반으로 고도화.

## 2. 구현

### 2.1 탐지기 `src/lib/ops/detect-issues.ts`
`detectOpsIssues(admin): Promise<{ open: number; resolved: number }>`:
1. **활성 신호 수집**(최근 창, 예: 24h):
   - 크론 실패: `job_runs` status='failed' by `job_key` → fp `cron:fail:{job_key}`, category='cron', severity=critical(핵심 크론)·warning.
   - 수집 실패: `crawl_logs` status∈(failed,partial) by `source_id` → fp `crawl:fail:{source_id}`, category='crawl', warning. (동일 소스 다건은 count 합산.)
   - 사용량 한도: provider 사용/실효한도 ≥95% → fp `usage:limit:{provider}` critical, ≥80% warning. 번역/TTS 동일(fp `usage:limit:translation`·`:tts`).
   - 보강 지연: pending&body_fetched_at null 이 임계 초과 → fp `enrichment:backlog` warning.
2. **upsert**(service_role): fingerprint 기준 `on conflict(fingerprint) do update`:
   - `occurrence_count = occurrence_count + <이번 관측 건수>`, `last_seen_at=now()`, severity·title·suspected_cause·recommended_action·impact 갱신.
   - **status 가 'resolved'였으면 're-open'**(status='open', resolved_at=null) — 재발.
   - **사람이 바꾼 status(acknowledged/in_progress/ignored)는 덮어쓰지 않는다**(open/resolved 만 자동 전이). → upsert 시 status 는 'resolved'→'open' 만 자동, 그 외는 유지.
3. **자동 해결**(§8.6): 이번 스캔에서 **재관측되지 않은 open 이슈** 중, 근거 신호가 해소된 것(예: 해당 job_key 최근 성공, 소스 정상, 사용량 <80%)은 `status='resolved'`, `resolved_at=now()`. (v1: "이번 스캔 미관측 + 신호 정상"이면 해결. 3회 연속 카운트는 후속 정교화.)
- title·suspected_cause·recommended_action 은 **운영 언어**(§8.1). 예: title "본문 보강 지연", cause "원문 서버 응답 지연 추정", action "실패 로그 확인 또는 해당 소스 일시 중지".

### 2.2 실행 지점
- **428 `ops-brief` 크론에서 `detectOpsIssues` 를 브리핑 집계 전에 호출**(일1회 탐지·해결). 그 후 브리핑이 open 이슈를 읽는다.
- ⚠️ 긴급 "즉시" 알림은 아직 아님(일1회 탐지) — 자주 탐지가 필요하면 후속(pg_cron/워커)로. §5 기록.

### 2.3 브리핑 ①섹션 고도화 (`daily-brief.ts`)
- ①"오늘 반드시 확인" = **open ops_issues(critical·warning)를 fingerprint 로 묶어** 나열: `title · 발생 N회 · 최초/마지막 · 권장조치`. (raw 수치 나열 대신 이슈 단위.)
- 제목의 "긴급 N · 주의 M" 은 open critical/warning ops_issues 수로 산정.
- notice·resolved 는 하단 참고/전날 해결 섹션.

## 3. 하지 말 것
- `ops_issues` 외 스키마 변경 금지(테이블은 수희 SQL).
- **사람이 설정한 status(acknowledged/in_progress/ignored)·assignee·resolution_note 를 탐지기가 덮어쓰지 않기.**
- 428 크론 스케줄·발송 로직 무변경(탐지 호출·①섹션 소스만 교체).
- 긴급 즉시 발송 만들지 않기(이번은 일1회 탐지·브리핑). 후속.
- 개별 사용자 PII 이슈화 금지(시스템 이슈만).

## 4. 회귀 가드
1. 탐지 실행 → 반복 에러가 fingerprint 별 **1개 ops_issue**로 묶임(occurrence_count 증가).
2. 동일 에러 재발 시 새 행 안 생김(count·last_seen 갱신).
3. 조건 해소 → 다음 탐지에서 **자동 resolved**.
4. resolved 였던 fp 재발 → **re-open**.
5. 사람이 바꾼 status(ack/in_progress/ignored)·assignee·메모 **보존**(탐지기가 안 덮음).
6. 일일 브리핑 ①섹션이 raw 수치 대신 **이슈 단위**로, 제목 긴급/주의 수가 open 이슈 수와 일치.
7. 428 발송·기존 크론 무영향.

## 5. 검증
```bash
npx tsc --noEmit && npm run lint && npm run build
ls src/lib/ops/detect-issues.ts
grep -n "ops_issues\|fingerprint\|detectOpsIssues\|onConflict\|upsert\|resolved" src/lib/ops/detect-issues.ts
grep -n "detectOpsIssues\|ops_issues" src/lib/ops/daily-brief.ts src/app/api/cron/ops-brief/route.ts
git diff --stat origin/main
```
**라이브(테이블 적용 후·배포 후)**
- [ ] 탐지 트리거 → ops_issues 에 fingerprint 별 이슈 생성
- [ ] 반복 에러 count 합산(중복 이슈 없음)
- [ ] 해소 시 자동 resolved / 재발 시 re-open
- [ ] 일일 브리핑 ①섹션 이슈 단위

## 6. 커밋
브랜치 `agent/429-ops-issues` → 커밋·푸시 → 재현검증 → **(ops_issues 테이블 적용 확인 후) "커밋해"** → 머지.
스테이징: `src/lib/ops/detect-issues.ts`(신규) · `src/lib/ops/daily-brief.ts`(①섹션) · `src/app/api/cron/ops-brief/route.ts`(탐지 호출) · 이 지시서
제외: 상시 목록(topic-covers NFD·council-bridge·성능-리전이동·골드샘플).
커밋: `feat: 운영 이슈 fingerprint 탐지기 + 브리핑 이슈화 (429)`

### 기록란 (구현자)
| 항목 | 결과 |
|---|---|
| fingerprint upsert(중복 이슈 없음) | |
| 자동 해결·재발 re-open | |
| 사람 status/assignee 보존 | |
| 428 브리핑 ①섹션 이슈화 | |
| ops_issues 외 스키마 무변경 | |

## 7. 다음
- 운영센터 어드민 UI(이슈 목록·상태변경·담당자·해결메모) — 별건(430~).
- 긴급 즉시 알림(자주 탐지 = pg_cron/워커) — §9.1 긴급 계층.
- 피드백 센터(Phase 3)의 유사신고 묶기도 같은 fingerprint 패턴 재사용.
