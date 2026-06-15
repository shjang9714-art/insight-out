# 지시서 33 — 이메일 발신 Resend → Brevo 마이그레이션 (API 방식)

> 작성: Opus(Cowork) · 대상: 구현 에이전트(Claude Code) · 검증: Opus · 커밋: 구현 에이전트
> ⚠️ 작업 전 `AGENTS.md` + 아래 3개 파일을 **반드시 정독**할 것:
> - `src/app/api/email/send-archive/route.ts` (아카이브 메일)
> - `src/lib/newsletter/dispatch.ts` (뉴스레터 일괄 발송)
> - `src/app/api/webhooks/resend/route.ts` (수신 이벤트 웹훅)
> - `src/proxy.ts`(L33 public 경로 배열) · `package.json`(deps)
> `npm install` 먼저.
> 범위: **트랜잭션/뉴스레터 발신을 Resend SDK에서 Brevo API(`@getbrevo/brevo`)로 교체.** 메일 템플릿(`src/lib/email/*`)·DB 스키마·발송 비즈니스 로직은 **그대로**. 발신 클라이언트·에러 흐름·웹훅 검증 방식만 교체.

---

## 0. 배경 / 결정

DAU가 배포 후 300명 규모로 예상돼, Resend 무료 한도(일 100건)를 빠르게 초과한다. Brevo 무료는 일 300건이라 헤드룸이 3배. **발신 코드가 아직 작을 때(발송 호출 2곳 + 웹훅 1개) 갈아타는 게 전환 비용 최저점**이라 지금 이전한다. 발신 방식은 **API**(`@getbrevo/brevo` SDK), SMTP 아님.

> ⚠️ Brevo 무료(일 300)도 DAU 300 + 뉴스레터 일괄발송 겹치는 날은 빠듯할 수 있다. "무료 영구"가 목표가 아니라 "무료로 더 오래 버티고 유료 전환이 더 싼 곳으로 이동"이 목적. 코드는 한도와 무관하게 동작해야 함(429 등 에러 핸들링 유지).

## 1. 의존성 교체

- 추가: `@getbrevo/brevo` (최신 v4.x; 호환 이슈 시 `^3.0.1` legacy 허용).
- 제거: `resend`. `svix`는 **웹훅 검증 전용**이었으므로 다른 사용처 없으면 제거(`grep -rn "svix" src/` 로 확인 후).
- `npm install @getbrevo/brevo` / `npm uninstall resend svix`.

## 2. 공통 — Brevo 발신 헬퍼 (신규)

`src/lib/email/brevo.ts` 신규 생성. 두 호출처에서 공유.

```ts
import * as brevo from '@getbrevo/brevo'

const api = new brevo.TransactionalEmailsApi()
api.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY ?? '')

export interface SendArgs {
  to: string
  subject: string
  html: string
}

/** 성공 시 messageId 반환, 실패 시 throw (Brevo SDK는 비2xx에서 reject). */
export async function sendBrevoEmail({ to, subject, html }: SendArgs): Promise<string> {
  const fromEmail = process.env.BREVO_FROM_EMAIL
  const fromName = process.env.BREVO_FROM_NAME ?? 'Insight Out'
  if (!fromEmail) {
    // 발신 도메인 미설정 — 호출처에서 catch되어 사용자 메시지로 카테고리화됨
    throw Object.assign(new Error('BREVO_FROM_EMAIL 미설정'), { name: 'missing_required_field' })
  }
  const message = new brevo.SendSmtpEmail()
  message.sender = { email: fromEmail, name: fromName }
  message.to = [{ email: to }]
  message.subject = subject
  message.htmlContent = html
  const res = await api.sendTransacEmail(message)
  // SDK 응답 형태는 버전마다 res.body.messageId 또는 res.messageId — 둘 다 방어적으로 읽을 것
  const messageId =
    (res as { body?: { messageId?: string }; messageId?: string }).body?.messageId ??
    (res as { messageId?: string }).messageId ??
    ''
  return messageId
}
```

> ⚠️ **에러 흐름 변경(중요)**: Resend는 `{ data, error }`를 *반환*했지만 Brevo SDK는 실패 시 **throw(reject)** 한다. 따라서 호출처는 `try/catch`로 감싸야 하며, 잡은 에러에서 메시지를 추출한다. Brevo 에러는 보통 `err.body`/`err.response?.body`에 `{ code, message }` 형태. `categorizeSendError`에 넘기기 전 `{ name, message }`로 정규화할 것:
> ```ts
> function normalizeBrevoError(err: unknown): { name?: string; message?: string } {
>   const e = err as { name?: string; body?: { code?: string; message?: string }; message?: string; response?: { body?: { message?: string } } }
>   return { name: e.name ?? e.body?.code, message: e.body?.message ?? e.response?.body?.message ?? e.message }
> }
> ```

## 3. `send-archive/route.ts` 교체

- L4 `import { Resend } from 'resend'` → `import { sendBrevoEmail } from '@/lib/email/brevo'` (+ 위 `normalizeBrevoError`를 이 파일 또는 헬퍼에).
- L34~37 환경변수 가드: `RESEND_FROM_EMAIL` → `BREVO_FROM_EMAIL`, 경고 문구도 Brevo 기준으로.
- L138~162 발송 블록을 try/catch로 교체:
  ```ts
  let messageId: string
  try {
    messageId = await sendBrevoEmail({ to: toEmail, subject: `[Insight Out] ${archive.name} — ${items.length}건의 인사이트`, html })
  } catch (err) {
    const norm = normalizeBrevoError(err)
    console.error('[send-archive] Brevo 발송 실패 | to=<hidden> | name=%s | message=%s', norm.name, norm.message)
    console.error('[send-archive] 수신자 도메인: %s', toEmail.split('@')[1] ?? 'unknown')
    return NextResponse.json({ error: categorizeSendError(norm) }, { status: 500 })
  }
  ```
- `categorizeSendError`(L9~29): 문구 내 "Resend 도메인 검증" → "발신 도메인 검증(Brevo)"로 수정. 분기 키워드(domain/unauthorized/blocked/rate 등)는 Brevo 에러 메시지에도 대체로 유효하니 유지.
- **수신자 주소는 응답 본문에 노출 금지**(현행 유지) — 로그에만 도메인 기록.

## 4. `dispatch.ts` 교체 (뉴스레터 루프)

- L2 `import { Resend } from 'resend'` → `import { sendBrevoEmail } from '@/lib/email/brevo'`.
- L114 `const resend = new Resend(...)` 줄 제거.
- L141~167 루프 내부 발송을 교체:
  ```ts
  try {
    const messageId = await sendBrevoEmail({ to: sub.newsletter_email!, subject, html })
    if (!messageId) throw new Error('messageId 없음')
    await supabase.from('newsletter_recipients').insert({
      issue_id: issue.id, user_id: sub.user_id, email: sub.newsletter_email!,
      resend_message_id: messageId, status: 'sent',   // ↓ 컬럼명 주의(아래)
    })
    sent++
  } catch (err) {
    await supabase.from('newsletter_recipients').insert({
      issue_id: issue.id, user_id: sub.user_id, email: sub.newsletter_email!,
      status: 'failed', error: err instanceof Error ? err.message : '발송 실패',
    })
    failed++
  }
  ```
- ⚠️ **DB 컬럼명**: `newsletter_recipients.resend_message_id` 는 그대로 **재사용**(범용 provider message id 저장 용도). 컬럼 rename은 SQL 마이그레이션을 유발하므로 **이번 범위에서 하지 않음**. 값만 Brevo messageId로 채운다. (원하면 후속 지시서에서 `provider_message_id`로 rename + 주석.)

## 5. 웹훅 교체 — `webhooks/resend/route.ts` → `webhooks/brevo/route.ts`

> ⚠️ **Brevo 트랜잭션 웹훅은 서명/인증 헤더가 없다.** svix 검증을 쓸 수 없으므로 **공유 시크릿**으로 보호한다. 파일을 `src/app/api/webhooks/brevo/route.ts`로 이동(신규 생성 + 기존 resend 디렉터리 삭제).

- svix 제거. 인증은 다음 중 하나:
  - **(권장)** Brevo 웹훅 등록 시 **커스텀 헤더** 지원되면 `X-Webhook-Token: <secret>` 추가 → 핸들러에서 `request.headers.get('x-webhook-token') === process.env.BREVO_WEBHOOK_SECRET` 검사.
  - 폴백: 등록 URL에 `?token=<secret>` 쿼리 → `new URL(request.url).searchParams.get('token')` 비교. (URL에 시크릿 노출되나 server-to-server라 허용 범위. 커스텀 헤더 가능하면 그쪽 우선.)
- 미설정/불일치 시 401.
- **Brevo 이벤트명·페이로드 매핑**(Resend와 다름):
  | Brevo event | 처리 |
  |---|---|
  | `delivered` | `status: 'delivered'`, `delivered_at` |
  | `opened` / `unique_opened` | `status: 'opened'`, `opened_at` |
  | `hard_bounce` / `soft_bounce` / `blocked` / `invalid_email` | `status: 'bounced'`, `error: '이메일 반송'` |
  | `spam` | complaint 경고 로그 |
  | 기타 | 미처리 로그 |
- 메시지 ID 필드: Brevo 페이로드는 **`message-id`(하이픈)** 키. 브래킷 접근: `payload['message-id']`. 이 값으로 `resend_message_id` 컬럼 매칭(§4와 동일 컬럼).
- 이벤트가 단건/배열 둘 다 올 수 있으니 방어적으로 처리(배열이면 순회).
- DB 업데이트 조건(현행 `.eq('status','sent')` 등)은 유지.

```ts
// 골격
export async function POST(request: NextRequest) {
  const secret = process.env.BREVO_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'BREVO_WEBHOOK_SECRET 미설정' }, { status: 401 })
  const provided = request.headers.get('x-webhook-token') ?? new URL(request.url).searchParams.get('token')
  if (provided !== secret) return NextResponse.json({ error: '인증 실패' }, { status: 401 })

  const raw = await request.json()
  const events = Array.isArray(raw) ? raw : [raw]
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  for (const ev of events) {
    const messageId = ev['message-id'] as string | undefined
    if (!messageId) continue
    // event별 update (위 매핑표)
  }
  return NextResponse.json({ ok: true })
}
```

## 6. `proxy.ts`

- L33 publicPaths 배열의 `'/api/webhooks/resend'` → `'/api/webhooks/brevo'`.

## 7. 환경변수 (Vercel — 수희가 직접 설정, 코드는 참조만)

> 코드는 아래 키를 참조한다. 실제 값 설정은 사용자가 Vercel/Brevo에서 수행(에이전트가 할 수 없음). 지시서엔 **키 이름과 용도만** 명시.

- `BREVO_API_KEY` — Brevo SMTP & API → API Keys에서 발급.
- `BREVO_FROM_EMAIL` — 인증된 발신 도메인 주소(예: `archive@send.<도메인>`).
- `BREVO_FROM_NAME` — 표시명(예: `Insight Out`). 미설정 시 기본 `Insight Out`.
- `BREVO_WEBHOOK_SECRET` — 웹훅 공유 시크릿(임의 난수). Brevo 웹훅 등록 시 헤더/쿼리에 동일 값.
- 기존 `RESEND_API_KEY` / `RESEND_FROM_EMAIL` / `RESEND_WEBHOOK_SECRET` 는 코드에서 더 이상 참조 안 함 → Vercel에서 제거 가능(코드 변경엔 영향 없음).
- 도메인 인증(SPF/DKIM/DMARC)은 Brevo의 **Senders, Domains & Dedicated IPs**에서 별도 수행 — Resend와 동일하게 도메인 소유 필요(미보유 시 선행 구매).

## 8. 점검

- `grep -rn "resend\|Resend\|svix" src/` → 잔존 0 (DB 컬럼명 `resend_message_id`는 의도적 잔존 — 코드 식별자 아님).
- `npx tsc --noEmit` · `npm run build` · `npm run lint`(신규 0).
- 발송 경로 수동 점검(환경변수 세팅 후): 아카이브 1건 본인 메일 발송 성공, 실패 시 사용자 메시지·서버 로그(도메인만) 정상.
- 웹훅: Brevo 대시보드 테스트 이벤트 → 인증 통과 + `newsletter_recipients` 상태 갱신 확인. 잘못된 토큰 → 401.

---

## 완료 조건
- [ ] `@getbrevo/brevo` 추가, `resend`·`svix` 제거(다른 사용처 없을 시)
- [ ] `src/lib/email/brevo.ts` 헬퍼 신규(throw 기반, messageId 방어적 추출)
- [ ] `send-archive/route.ts` try/catch 전환, `BREVO_FROM_EMAIL` 가드, 수신자 응답 비노출 유지
- [ ] `dispatch.ts` 루프 try/catch 전환, `resend_message_id` 컬럼에 Brevo messageId 저장(컬럼 rename 없음)
- [ ] 웹훅 `/api/webhooks/brevo`로 이동, 공유 시크릿 인증, Brevo 이벤트 매핑, `message-id` 키 사용, 배열 방어
- [ ] `proxy.ts` public 경로 갱신
- [ ] `grep resend/Resend/svix` 잔존 0(DB 컬럼명 제외)
- [ ] `tsc` · `build` · `lint` 통과
- [ ] 환경변수 키 목록 보고(값 설정은 사용자 몫)

## 보고 양식
```
## 완료 보고 — 지시서 33 Resend→Brevo 마이그레이션
- 의존성: 추가/제거 <목록>
- 신규 헬퍼: src/lib/email/brevo.ts <요지>
- send-archive: <try/catch 전환·가드>
- dispatch: <루프 전환·컬럼 재사용>
- 웹훅: <경로 이동·인증 방식·이벤트 매핑>
- proxy 경로: <확인>
- grep 잔존(resend/svix): <컬럼명 외 0>
- 필요한 환경변수 키: BREVO_API_KEY / BREVO_FROM_EMAIL / BREVO_FROM_NAME / BREVO_WEBHOOK_SECRET
- 검증: tsc · build · lint
- 미해결: <없으면 "없음">
```
```
