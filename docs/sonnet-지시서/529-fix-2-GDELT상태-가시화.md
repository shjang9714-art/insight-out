# 지시서 529-fix-2 — GDELT 상태 가시화

## 기준

- 브랜치: `agent/529-fix-2-gdelt`
- 기준: 531 병합 후 `origin/main`
- 대상: `src/components/admin/panels/CrawlLogsPanel.tsx`

## 문제

529에서 계산하는 `providerStatus` / `providerErrors`가 `job_runs.meta`에만 저장되고 어드민 화면에서는 읽히지 않는다. GDELT 호출이 실패해도 사용자에게는 원인 없이 `GDELT 0건`만 표시된다.

## 수정

1. `cron:crawl-seeds` 최신 실행의 `meta.providerStatus.gdelt`와 `meta.providerErrors.gdelt`를 방어적으로 파싱한다.
2. GDELT 칩을 상태별로 표시한다.
   - `failed`: 위험 색과 실패 원문
   - `disabled`: 회색 `환경변수로 비활성`
   - `enabled` + 0건: 기존 amber 경고
   - 구버전 meta: 기존 화면 유지

## 제외

- orchestrator·adapter 로직 수정
- 새 테이블·컬럼·알림 추가
- DDL·SQL 작성

## 검증

- `npx tsc --noEmit`
- `npx eslint`
- `npm run build`

