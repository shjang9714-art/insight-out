# 지시서 427 — C 보강 워커 스케줄러 (GitHub Actions 워크플로 파일)

> 작성: 플래너(Opus) · 2026-07-24 · Phase 1-C 스케줄러(옵션 A)
> 근거: `docs/Phase1C-스케줄러-핸드오프-2026-07-24.md` 옵션 A. 기존 `/api/cron/body-backfill`(GET, Bearer CRON_SECRET)을 10분마다 호출해 pending 보강 큐 드레인.
> 협업 루프: 검증용 브랜치 `agent/427-enrich-drain-workflow`(from `origin/main`) → 재현검증 → "커밋해" → 머지.
> 번호: 427 · git author David(yjhead@gmail.com) · **SQL 0.**

---

## 0. 한 줄
GitHub Actions 스케줄 워크플로 `.github/workflows/enrich-drain.yml` 하나를 추가해, 10분마다 `/api/cron/body-backfill` 을 호출한다. **파일만 추가**(코드 변경 없음).

---

## 1. 🔴 활성화·선행 (매우 중요)
- **스케줄 워크플로는 기본 브랜치(main)에 있어야만 실행된다.** 즉 이 파일이 **main 에 병합되는 순간 10분 스케줄이 켜진다.**
- 따라서 **반영(main 머지)은 두 조건 충족 후**:
  1. **426(drainBackfill 관련도 게이트) 배포 완료** — 안 그러면 자주 드레인 시 관련도 없이 short 기사 게시.
  2. **GitHub 리포 시크릿 `CRON_SECRET` 등록**(Vercel 의 CRON_SECRET 과 동일 값). 없으면 빈 Bearer → 401.
- ⚠️ 구현·재현검증은 지금 해도 되지만(agent 브랜치에선 스케줄 안 돎), **"커밋해"(반영)는 위 1·2 확인 후.**

## 2. 구현 (파일 1개 추가)
`.github/workflows/enrich-drain.yml`:
```yaml
name: enrich-drain
on:
  schedule:
    - cron: '*/10 * * * *'   # 10분마다(UTC). GitHub 무료 티어는 수 분 지연 가능
  workflow_dispatch: {}       # 수동 실행(테스트)
concurrency:
  group: enrich-drain
  cancel-in-progress: false
jobs:
  drain:
    runs-on: ubuntu-latest
    steps:
      - name: Call body-backfill enrich drain
        run: |
          curl -sS -X GET "https://insight-out-app.vercel.app/api/cron/body-backfill" \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            --fail-with-body
```

## 3. 하지 말 것
- 엔드포인트·크롤러·앱 코드 **무변경**(워크플로 파일만 추가).
- `vercel.json` 크론 **무변경**(이건 GitHub 스케줄).
- URL·헤더·시크릿 이름 변경 금지(위 그대로).

## 4. 회귀 가드
1. `.github/workflows/enrich-drain.yml` 만 추가됨(다른 파일 무변경).
2. YAML 문법 유효(간단 파싱).
3. 반영 전까지(agent 브랜치) 스케줄 실행 안 됨.
4. main 반영 + 시크릿 등록 후 Actions 탭에서 `workflow_dispatch` 수동 실행 시 200.

## 5. 검증
```bash
ls .github/workflows/enrich-drain.yml
git diff --stat origin/main   # 이 파일 + 지시서만
# YAML 유효성(선택): python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/enrich-drain.yml'))"
```
**활성화 후 라이브(David/리포 관리자)**
- [ ] 리포 시크릿 `CRON_SECRET` 등록
- [ ] Actions → enrich-drain → Run workflow(수동) → 200
- [ ] Vercel 함수 로그에 body-backfill 호출
- [ ] `pending & body_fetched_at IS NULL` 큐 감소

## 6. 커밋
브랜치 `agent/427-enrich-drain-workflow` → 커밋·푸시 → 재현검증 → **(426 배포 + 시크릿 등록 확인 후) "커밋해"** → 머지.
스테이징: `.github/workflows/enrich-drain.yml` · 이 지시서
제외: 상시 목록(topic-covers NFD·council-bridge·성능-리전이동·골드샘플).
커밋: `chore: C 보강 워커 스케줄러 GitHub Actions 워크플로 (10분 body-backfill 드레인, 427)`

### 기록란 (구현자)
| 항목 | 결과 |
|---|---|
| 워크플로 파일만 추가 | |
| YAML 유효 | |
| (반영 시) 426 배포·CRON_SECRET 시크릿 확인 | |

## 7. 다음
- 활성화 후 큐 감소·소스 다양성↑ 관찰. 간격은 적체 보며 5~15분 조정.
- (여유) 1회 바운드 축소(limit 20·deadline 90~120s) — 별건 소폭 조정.
