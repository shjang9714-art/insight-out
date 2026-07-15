# 지시서 361 — COUNCIL(AI 협의체) 임베드 복구 (insight-out)

> 대상: 구현 에이전트 · **신규 SQL 없음** · insight-out 레포 전용(COUNCIL 앱은 별도 레포·이미 완료)
> ⚠️ 읽을 것: `src/middleware.ts`(publicPaths) · `src/lib/lab/tabs.ts`(360 이후 공용 모듈) · `src/components/analysis/LabBoard.tsx` · `src/app/dashboard/lab/page.tsx`(Suspense) · `AGENTS.md`

## 배경 / 정정
insight-out 쪽 COUNCIL 통합이 회귀됨. **원인**: 통합 파일들이 main에 **커밋된 적 없이 WIP(미추적)** 상태라, 타 레인(351/355/358/360) 머지 때마다 stash로 쓸려갔다. 계획서엔 "이미 존재"라 돼 있으나 **origin/main엔 아래 3파일이 없다(확인됨)**. 이번에 **제대로 커밋**해 재회귀를 끊는다.

## 복구 대상
### (1) 누락된 3파일 — `stash@{0}`(미추적 부모 `^3`)에서 복구
`git stash list` 의 `stash@{0}: On main: wip: council feature ...` 안에 온전히 존재(미추적이라 `^3` 트리에 있음):
- `src/app/api/council/route.ts` (186줄) — COUNCIL용 read-only REST 브릿지(Bearer read 스코프 재검증, 토큰 없으면 401 JSON)
- `src/components/dashboard/CouncilWorkspace.tsx` (118줄) — iframe 래퍼(`NEXT_PUBLIC_COUNCIL_URL` 폴백 `localhost:3000`, `useSearchParams`)
- `src/app/dashboard/council/page.tsx` (22줄) — 스탠드얼론 라우트(딥링크용, `CouncilWorkspace` import)

복구 방법(미추적이므로 `^3` 지정):
```bash
git restore --source='stash@{0}^3' -- \
  src/app/api/council/route.ts \
  src/components/dashboard/CouncilWorkspace.tsx \
  src/app/dashboard/council/page.tsx
```
⚠️ **`git stash pop` 금지** — 이 stash엔 360 이전 버전의 `lib/lab/tabs.ts`·로그·타 레인 문서가 섞여 있어 pop하면 360 픽스를 되돌린다. **위 3파일만 명시 복구.** 복구 후 3파일 내용이 온전한지(줄수·import) 확인.

### (2) 훅업 2건 — 현재 main 위에서 새로 적용
**A. 미들웨어 공개경로** `src/middleware.ts` `publicPaths` 배열에 `'/api/council'` 추가(끝에). `/api/mcp`와 동일 처리 — route가 Bearer read 토큰을 재검증하므로 보안 느슨해지지 않음(토큰 없으면 401 JSON, 공개경로 아니면 `/login` 리다이렉트로 브릿지가 깨짐).

**B. 실험실 베타 탭**(관리자 전용 노출):
- `src/lib/lab/tabs.ts`: `LabViewId`에 `'council'` 추가, `LAB_TABS`에 `{ id: 'council', label: 'AI 협의체 (베타)' }` 추가(`LAB_VIEW_IDS`는 map이라 자동). **이 파일은 360대로 서버/클라 공용 순수 상수 유지**(`'use client'` 금지).
- `src/components/analysis/LabBoard.tsx`: `import CouncilWorkspace from '@/components/dashboard/CouncilWorkspace'` 추가 + `view === 'council'` 렌더 분기(베타 안내 + `<CouncilWorkspace/>`). `lab/page.tsx`가 이미 `<Suspense>`로 감싸므로 `useSearchParams` 추가 조치 불필요.

**메인 NAV_TABS엔 추가하지 않는다**(의도된 제거 — 실험실 베타로만 노출).

## 회귀 / 주의
- **커밋 필수**: 3파일 + 2훅업을 **브랜치에 커밋**해 main에 박는다(WIP·미추적으로 두지 말 것 — 그게 회귀 원인). 이번엔 반드시 tracked로.
- `NEXT_PUBLIC_COUNCIL_URL` 미설정 시 임베드는 폴백 URL로 동작, MI 토큰 미설정 시 MI만 우아하게 빠짐(임베드·토론은 정상) — 이 레인 밖 env는 참고만.
- 색 토큰·`prefetch={false}` 유지.
- 검증: `tsc`·ESLint·`check-prefetch`·`build` + 육안 — `/dashboard/lab?view=council`에서 "AI 협의체 (베타)" 탭·iframe 로드, `/api/council?resource=issues` 토큰 없이 **401 JSON**(`/login` 리다이렉트면 A 미반영).

## 배포 게이트
⚠️ main 머지·배포 금지. 브랜치 push + PR까지만 하고 브랜치명 회신 → Opus 검증(tsc·build·diff·지시서 대조 + `^3` 복구 파일 온전성) 통과 후 머지·배포.

## 쪼개기
**① 3파일 복구 커밋 / ② 훅업 2건(middleware + tabs + LabBoard)** 2커밋.
