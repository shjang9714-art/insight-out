# Phase 3-A 뉴스레터 — 실행 체크리스트 (한 장)

> 순서대로. **[수희]** = 사람이 직접 / **[Code]** = Claude Code에 위임 / **[David]** = 머지·배포

## 0. 선행 — DB
- [ ] **[수희]** `supabase/2026-06-07-뉴스레터-스키마.sql` 전체 복사 → Supabase SQL Editor 실행 → 에러 없음 확인

## 1. #40·#41 구현 (지시서 24)
- [ ] **[Code]** 아래 프롬프트로 위임:
  > AGENTS.md 먼저 읽고 규칙 따라서, `docs/sonnet-지시서/24-뉴스레터-템플릿-발송.md` 대로 작업해줘. 새 브랜치 `feat/newsletter-dispatch`에서 작업하고, 끝나면 `npm run build` 통과까지 확인해줘. 커밋은 하되 푸시 전 멈춰서 변경 요약 보여줘.
- [ ] **[Code]** 산출 확인: `newsletter-template.ts`, `newsletter/dispatch.ts`, `/api/cron/newsletter`, `/api/newsletter/unsubscribe`, `vercel.json` 크론 추가, `middleware.ts` publicPaths에 `/api/newsletter/unsubscribe` 추가, 온보딩 주기 단계 제거 + 마이페이지 on/off 전환
- [ ] **[Code]** `npm run build` 통과(tsc/lint 0 에러)

## 2. 배포 (#40·#41)
- [ ] **[수희/David]** 브랜치 push → PR Squash & merge
- [ ] **[수희]** `/api/version`으로 배포 SHA 확인
- [ ] **[수희]** 검증: 어드민 페이지(다음 단계 전)라 수동발송 UI는 아직 없음 → 임시로 `newsletter_settings.is_enabled=true`, `last_sent_on=null` 둔 뒤 `/api/cron/newsletter`를 `CRON_SECRET`으로 호출해 **본인 계정 수신 + `newsletter_issues`/`newsletter_recipients` 적재** 확인

## 3. #42 어드민 관리 (지시서 25) — 1·2 머지 후
- [ ] **[Code]** 위임:
  > AGENTS.md 먼저 읽고, `docs/sonnet-지시서/25-어드민-뉴스레터-관리.md` 대로 작업해줘. 새 브랜치 `feat/newsletter-admin`에서 작업하고, 필요한 `npm i svix` 포함. `npm run build` 통과까지 확인하고 푸시 전 멈춰서 요약 보여줘.
- [ ] **[Code]** 산출 확인: `/admin/newsletter` 페이지 + NAV, `actions.ts`(설정/수동발송/미리보기, 전부 requireAdmin), `/api/webhooks/resend`(Svix 검증) + middleware publicPaths 추가

## 4. 환경변수 / 외부 설정 (#42 동작용)
- [ ] **[수희]** Vercel 환경변수 추가(Production+Preview 스코프):
  - `NEXT_PUBLIC_APP_URL` = `https://insight-out-app.vercel.app` (메일 링크용; 없어도 폴백되나 권장)
  - `RESEND_WEBHOOK_SECRET` = (Resend webhook 발급 값)
- [ ] **[수희]** Resend 대시보드 → Webhooks → 엔드포인트 `https://insight-out-app.vercel.app/api/webhooks/resend` 등록, 이벤트 `email.delivered`·`email.opened`·`email.bounced`

## 5. 배포·검증 (#42)
- [ ] **[수희/David]** PR 머지 → `/api/version` 확인
- [ ] **[수희]** `/admin/newsletter`에서: 설정 저장 → 미리보기 → **수동발송** → 본인 수신 → 메일 열기 후 이력에서 **오픈율 반영** 확인
- [ ] **[수희]** 메일 푸터 **구독 해지 링크** 클릭 → `is_active=false` 되는지 확인

## 6. 마무리
- [ ] **[Code/David]** `AGENTS.md §14` 갱신(발송=어드민 전역 설정, 템플릿=HTML 빌더, 수신거부 유지) + 작업계획서 #40~#42 🟢 동기화
- [ ] **[참고]** Vercel **Hobby**면 발송 시각 임의 지정 불가(일 1회 08:00 KST 고정). 시각 완전 제어는 **Pro 전환 후** `vercel.json` 크론을 `0 * * * *`로 변경(코드 변경 불필요)
