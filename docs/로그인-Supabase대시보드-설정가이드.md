# 로그인 OTP — Supabase 대시보드 설정 가이드 (David용, 코드 밖)

로그인(회사 이메일 OTP, 지시서 239/240/247)이 **실제로 작동하려면** 아래 대시보드 설정이 필요하다. 코드가 완성돼도 이게 없으면 코드 메일이 안 나간다. 결정: **Brevo 무료 1계정으로 시작**(하루 300통, 뉴스레터와 공유 — 볼륨 커지면 분리/유료 재검토).

체크 순서: **A SMTP → B 이메일 템플릿 → C Auth rate limit → D 도메인 Hook → E 발신 도메인 인증.**

---

## A. SMTP 연결 (Brevo 무료) — OTP 메일 발송의 핵심
OTP 메일은 **Supabase Auth가 발송**한다. 기본 내장 메일은 시간당 소수 제한(프로덕션 불가) → **Brevo SMTP 릴레이를 연결**한다.

1. **Brevo에서 SMTP 키 발급**: Brevo 로그인 → **SMTP & API → SMTP** 탭 → SMTP 키(Master password) 확인/생성. (앱 뉴스레터용 API 키와 별개)
   - SMTP 서버: `smtp-relay.brevo.com`, 포트 `587`(STARTTLS).
   - 로그인(Username): Brevo 계정 이메일. 비밀번호: 위 SMTP 키.
2. **Supabase 대시보드 → Project → Authentication → Emails(또는 Settings) → SMTP Settings → Enable Custom SMTP**:
   - Host `smtp-relay.brevo.com` · Port `587`
   - Username = Brevo 계정 이메일 · Password = Brevo SMTP 키
   - **Sender email**: 발신 주소(예: `no-reply@lguplus.co.kr` 또는 브랜드 도메인). **Brevo에서 인증된 발신자/도메인**이어야 함(E 참고).
   - Sender name: `Insight Out`
3. 저장 후 테스트: 로그인 화면에서 `@lguplus.co.kr` 이메일로 코드 요청 → 수신 확인.

> ⚠️ **Brevo 무료 = 하루 300통, 뉴스레터와 공유.** 뉴스레터 대량 발송일엔 OTP가 막힐 수 있음 → 볼륨 커지면 (a) Brevo 유료 또는 (b) 인증 전용 서비스(Resend/SES) 분리 재검토.

## B. 이메일 템플릿 (6자리 코드 표시)
`signInWithOtp` 은 **Magic Link 템플릿**을 사용한다. 여기에 `{{ .Token }}` 이 있어야 6자리 코드가 메일에 뜬다(없으면 링크만 나가 코드가 안 보임).

- **Authentication → Email Templates → "Magic Link"** 열기.
- 본문을 **`docs/이메일템플릿-OTP-magiclink.html`** 내용으로 교체(브랜드 + `{{ .Token }}` 코드박스 + 10분 유효 안내).
- 제목(Subject) 예: `[Insight Out] 로그인 인증 코드`.
- (선택) "Confirm signup" 템플릿도 동일 톤으로 맞추면 최초 가입 메일도 일관.

## C. Auth 이메일 rate limit 상향
커스텀 SMTP를 붙여도 Supabase Auth는 **인증 메일 시간당 제한**(기본 낮음)을 둔다. 온보딩 버스트 대비 상향.
- **Authentication → Rate Limits → "Email sent"** 값을 상향(예: 시간당 100+ — Brevo 일일 300 내에서). 조직 규모/온보딩 예상에 맞춰 조정.

## D. Before User Created Hook 등록 (도메인 제한, 239 SQL)
- 239 SQL(`239-로그인-도메인hook-자동승인.sql`) 적용 후:
- **Authentication → Hooks → "Before user created"** → Postgres function `public.hook_restrict_signup_by_email_domain` 선택 → **Enable**.
- 효과: `@lguplus.co.kr`(+allowlist admin gmail)만 가입 통과, 그 외 거부.

## E. 발신 도메인 인증 (전달률·스팸 방지)
- Brevo → **Senders, Domains & Dedicated IPs → Domains** 에서 발신 도메인 추가 → **SPF·DKIM** DNS 레코드 등록(회사 도메인 관리자 협조).
- 도메인 인증 없이 발송하면 스팸함 직행/차단 위험. 사내 메일이라 특히 중요.

---

## 완료 체크리스트
- [ ] A: Brevo SMTP를 Supabase Auth에 연결, 발신주소 설정.
- [ ] B: Magic Link 템플릿에 OTP HTML(`{{ .Token }}`) 적용 + 제목.
- [ ] C: Auth 이메일 rate limit 상향.
- [ ] D: Before-user-created Hook 활성(239 SQL 후).
- [ ] E: Brevo 발신 도메인 SPF/DKIM 인증.
- [ ] 실테스트: `@lguplus.co.kr` 로그인 → 코드 수신 → 대시보드 진입(자동 승인).

> 관련: 지시서 239(OTP·도메인Hook·자동승인)·240(관리자 Google)·247(전구 히어로 UI). 이 가이드는 **대시보드 설정**만 — 코드는 해당 지시서.
