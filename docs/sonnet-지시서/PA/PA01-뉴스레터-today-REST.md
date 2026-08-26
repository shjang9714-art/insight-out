# 지시서 PA01 — `/api/newsletter/today` (발송된 뉴스레터 → 팀즈 카드)

> 작성: 플래너(Opus) · 근거: David가 340 시도 → **307**. 원인·구조 실측 완료.
> 협업 루프: 로컬(커밋X) → 위임 → 재현검증 → "커밋해" → 커밋·병합·푸시.
> **SQL 없음**

---

## 0. 한 줄 (⚠️ 340에서 방향 수정됨)

Power Automate가 **오늘 인사이트 아웃이 발송한 뉴스레터**(`newsletter_issues`)를 GET 한 번으로 받아
팀즈에 카드로 게시한다. **콘텐츠를 새로 고르지 않는다 — 이메일로 나간 그 뉴스레터를 그대로 전달한다.**

---

## 1. 🔴 정확한 소스 — `newsletter_issues.payload`

**핵심 실측: `dispatch.ts`가 발송 시 완성된 카드 데이터를 통째로 `payload`(jsonb)에 저장한다** (`dispatch.ts:128 payload: prepared`).
→ 우리는 **payload를 읽기만 하면 된다. 재조립·LLM 호출 없음.**

`payload` = `PreparedNewsletterIssue` (`src/lib/newsletter/prepare-issue.ts:39`):
```ts
{
  newsGroups: [{ key, label, cards: [{
    id, title, category, sourceName, summaryKo, originalUrl, detailUrl, insight
  }] }],
  topTeaser: { type:'flow'|'insight', headline, ... } | null,
  knowledgeReports: [...]
}
```

`newsletter_issues` 행: `id, sent_on(date), subject, content_ids[], status, triggered_by, payload(jsonb)`.
상태 흐름: 생성 `pending` → 발송 후 `sent`(전건성공) / `partial` / `failed`.

---

## 2. 🔴 왜 340 시도가 307이었나 (그대로 유효)

`/api/newsletter/today` 는 (1) 존재하지 않았고 (2) 있어도 `src/middleware.ts` 가 세션 없는 요청을
`/login` 으로 307 리다이렉트한다. **§4 미들웨어 등록이 이 지시서의 필수 축이다.**

---

## 3. 만들 것 — `src/app/api/newsletter/today/route.ts`

### 3.1 인증 — `CRON_SECRET` (기계 호출, `cron/newsletter` 패턴 복제)
```ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, error: '인증 실패' }, { status: 401 })
  }
  ...
}
```

### 3.2 오늘 발송된 issue 조회
```ts
const admin = createAdminClient()  // service_role
// KST 오늘 (dispatch.ts getTodayKST 와 동일 규칙: now + 9h)
const todayKST = new Date(Date.now() + 9*3600_000).toISOString().slice(0,10)

const { data: issue } = await admin
  .from('newsletter_issues')
  .select('id, sent_on, subject, status, payload')
  .eq('sent_on', todayKST)
  .eq('status', 'sent')          // 전건 성공분만 (partial 포함하려면 .in([...]) — §6 결정 참고)
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle()
```
- **오늘 발송분이 없으면** `{ date: todayKST, sent: false, items: [] }` (200). 팀즈는 "오늘 뉴스레터 없음" 처리
- 쿼리 파라미터 `?date=YYYY-MM-DD` 로 특정일 조회 허용(테스트·백필용). 없으면 오늘

### 3.3 payload → 평탄한 카드 배열로 변환
`payload.newsGroups[].cards[]` 를 순회해 팀즈가 쓰기 쉬운 flat JSON 으로:
```jsonc
{
  "date": "2026-07-13",
  "sent": true,
  "subject": "Insight Out 뉴스레터 · 2026-07-13",
  "teaser": "…" | null,                    // payload.topTeaser?.headline ?? null (문자열)
  "items": [
    {
      "group": "시장동향",              // newsGroups[].label
      "title": "…",                     // cards[].title
      "summary": "…",                   // cards[].summaryKo ?? ''
      "insight": "…",                   // cards[].insight ?? ''  (인사이트 아웃이 만든 한 줄 코멘트)
      "source": "전자신문",             // cards[].sourceName ?? ''
      "url": "https://…"                // cards[].originalUrl ?? cards[].detailUrl
    }
  ]
}
```
- **payload 를 그대로 재조립만 한다.** `contents` 재조회·정렬·LLM 금지
- payload 구조가 없거나 비면(구버전 issue) `items: []` 로 안전 반환
- 읽기 전용 — `newsletter_issues` 에 쓰지 않는다

---

## 4. 🔴 미들웨어 공개경로 등록 (307 방지 — 필수)

`src/middleware.ts` `publicPaths` 배열(56~58행)에 정확히 추가:
```ts
'/api/newsletter/today',   // ← PA01: PA 서버-투-서버, CRON_SECRET 자체 인증
```
⚠️ `/api/newsletter` 로 뭉뚱그리지 말 것 — `/api/newsletter/today` 로 정확히. (`startsWith` 매칭)

---

## 5. 검증 (재현 가능)

1. `npx tsc --noEmit --incremental false` → 0, `npx eslint src/app/api/newsletter src/middleware.ts` → 0
2. **307 사라짐 확인** (핵심):
   ```
   curl -i -H "Authorization: Bearer <CRON_SECRET>" \
     "https://insight-out-app.vercel.app/api/newsletter/today"
   ```
   → 200 + JSON. (307이면 §4 미등록, 401이면 시크릿)
3. 시크릿 없이 → **401** (307 아님)
4. 오늘 발송분 있으면 `sent:true` + items 채워짐 / 없으면 `sent:false` + `items:[]`
5. `?date=` 로 과거 발송일 조회 → 그 날 payload 반환

---

## 6. 결정 필요 (구현 전 David 확인 — 기본값 명시)

- **partial 포함?** 기본은 `status='sent'` 만. 일부 실패한 회차(`partial`)도 내용은 동일하므로
  `.in(['sent','partial'])` 로 넓혀도 무방. **기본: sent 만.** (넓히려면 이 줄만 수정)
- **발송 전 조회 타이밍**: 뉴스레터 크론은 08:00 KST 발송. Power Automate 는 그 **이후**(예: 09:00)에 돌려야
  당일 발송분이 잡힌다. 08:00 이전에 부르면 `sent:false`.

---

## 7. Power Automate (David, 배포 후)

**Recurrence(매일 09:00 KST) → HTTP → Parse JSON → 조건(sent) → Apply to each(items) → Post card in a channel**

**HTTP:**
| 필드 | 값 |
|---|---|
| 메서드 | `GET` |
| URI | `https://insight-out-app.vercel.app/api/newsletter/today` |
| 헤더 | `Authorization` : `Bearer <CRON_SECRET>` |
| 본문 | 비움 |

**조건**: `body('Parse_JSON')?['sent']` 가 true 일 때만 게시.

**어댑티브 카드**(items 순회 — 디자인은 자유롭게 조정 가능):
```json
{
  "type": "AdaptiveCard",
  "version": "1.4",
  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
  "body": [
    { "type": "TextBlock", "size": "Small", "isSubtle": true,
      "text": "@{items('Apply_to_each')?['group']}" },
    { "type": "TextBlock", "size": "Medium", "weight": "Bolder", "wrap": true,
      "text": "@{items('Apply_to_each')?['title']}" },
    { "type": "TextBlock", "wrap": true,
      "text": "@{items('Apply_to_each')?['summary']}" },
    { "type": "TextBlock", "wrap": true, "isSubtle": true,
      "text": "💡 @{items('Apply_to_each')?['insight']}" },
    { "type": "TextBlock", "size": "Small", "isSubtle": true, "spacing": "None",
      "text": "@{items('Apply_to_each')?['source']}" }
  ],
  "actions": [
    { "type": "Action.OpenUrl", "title": "원문 보기",
      "url": "@{items('Apply_to_each')?['url']}" }
  ]
}
```
> 첫 카드로 `subject`·`teaser.headline` 을 헤더 카드로 한 장 먼저 게시하면 더 낫다(선택).

---

## 8. 하지 말 것

- ❌ §4 미들웨어 등록 생략 — 307 재발
- ❌ `contents` 재조회·정렬·LLM 호출 — **payload 를 그대로 쓴다**. 이메일과 내용이 달라지면 안 됨
- ❌ `dispatch.ts`·`prepare-issue.ts`·`newsletter_issues` 수정 금지 (읽기 전용)
- ❌ 190 mcp_tokens 인증 금지 (기계 채널 → CRON_SECRET)
- ❌ 수신자 PII(`newsletter_recipients`) 조회 금지
- ❌ `CRON_SECRET` 팀원 공유·문서 평문 금지
