# Phase 3-A 뉴스레터 자동 발송 — 설계/의사결정 (Opus)

> 작성: Opus(Cowork) · 2026-06-07 · 대상 항목 #40·#41·#42 (수희 트랙)
> 산출물: 본 설계서 + `supabase/2026-06-07-뉴스레터-스키마.sql` + 지시서 24·25

## 0. 작업 순서

```
#40 템플릿(Opus 설계) → #41 자동 발송(Sonnet) → #42 어드민 관리(Sonnet)
```
의존: #40 템플릿이 #41의 발송 본체이자 #42의 미리보기 대상. **#40부터.**
선행: `supabase/2026-06-07-뉴스레터-스키마.sql`를 Supabase에서 먼저 실행.

## 1. 확정된 의사결정

| # | 결정 | 내용 |
|---|------|------|
| 1 | 오픈율 | **Resend webhook** 사용. `newsletter_recipients.resend_message_id`로 매칭해 `opened_at`/`delivered_at` 갱신. 자체 트래킹 픽셀 미구현. |
| 2 | 콘텐츠 선정 | `contents`(published) 중 **`is_editor_pick` 우선 → `view_count` → `published_at`** 정렬 상위 `card_count`장. |
| 2 | 발송 주기 | **어드민 전역 관리**(`newsletter_settings`). per-user 주기 폐기. **온보딩의 주기 선택 UI 삭제.** |
| 3 | 발송 시간/요일 | 어드민이 `send_hour_kst` + `send_days`(ISO 요일 배열) 설정. |
| 4 | 템플릿 방식 | **기존 HTML 빌더 패턴 재사용**(`lib/email/archive-template.ts` 스타일). React Email 미도입(신규 의존성 0, 출시 코드와 일관). |
| - | 수신거부 | **법적 필수**(AGENTS §14). 토큰 기반 비로그인 해지 링크 + 엔드포인트 포함. |

## 2. 재사용 자산 (이미 구현됨)

- **Resend** 통합(`resend ^6.12.4`, `/api/email/send-archive`, `lib/email/archive-template.ts`).
- **`newsletter_subscriptions`**(user_id, is_active, newsletter_email) — 수신자 명단. `frequency`는 폐기(컬럼 유지, 미사용).
- **`contents`**: `is_editor_pick`·`view_count`·`status`·`category`·`summary_ko`·`original_url`.
- 크롤러 Cron 패턴(`/api/cron/crawl` + `CRON_SECRET`).

## 3. 데이터 모델 (신규 SQL 참조)

- `newsletter_settings` — 싱글톤(id=1). 전역 on/off·시각·요일·카드수·제목템플릿·`last_sent_on`(멱등).
- `newsletter_issues` — 발송 회차 1행(날짜·제목·content_ids·수신자수·status·trigger).
- `newsletter_recipients` — 회차×수신자(이메일·resend_message_id·status·delivered/opened).
- `newsletter_subscriptions.unsubscribe_token` 추가.
- RLS: 조회는 admin만, 쓰기는 service_role(크론). GRANT는 authenticated만(민감 데이터 → anon 제외).

## 4. 발송 로직 (#41)

엔드포인트 `/api/cron/newsletter` (Bearer `CRON_SECRET`):

1. `newsletter_settings` 로드 → `is_enabled=false`면 skip.
2. KST 현재 요일이 `send_days`에 없으면 skip.
3. `last_sent_on == 오늘(KST)`면 skip(**멱등**).
4. (Pro/시간별 크론 시) 현재 KST 시 ≠ `send_hour_kst`면 skip.
5. 수신자: `newsletter_subscriptions` where `is_active=true` and `newsletter_email is not null` (+users join).
6. 콘텐츠: §1-2 정렬 상위 `card_count`장(직전 발송 이후 신규 우선, 부족분은 최신 보충).
7. `newsletter_issues`(status=pending) 생성 → 수신자별 Resend 발송 → `newsletter_recipients` insert(+resend id).
8. 집계로 issue status(sent/partial/failed)·recipient_cnt 갱신, `settings.last_sent_on = 오늘(KST)`.

### ⚠️ Cron 제약 (인프라 의존)
어드민이 **시각**을 임의 지정하려면 크론이 **시간별(`0 * * * *`)** 로 돌아야 하고, 이는 **Vercel Pro 필요**(Hobby 크론은 일 1회 제한).
- **v1(Hobby)**: `vercel.json`에 일 1회 크론(예 `0 23 * * *` = 08:00 KST) 추가. 어드민은 on/off·요일·카드수·제목을 제어, **시각은 크론 고정시간이 우선**(설정값은 저장만).
- **v2(Pro 전환 후)**: 크론을 `0 * * * *`로 바꾸면 `send_hour_kst` 완전 반영(코드 변경 불필요 — 핸들러가 매 실행 설정 확인).

## 5. 수신거부 (법적 필수)

- 모든 발송 메일 푸터에 `{APP_URL}/api/newsletter/unsubscribe?token={unsubscribe_token}` 링크.
- 엔드포인트(service_role): 토큰으로 구독 찾아 `is_active=false` → 해지 완료 페이지. 로그인 불필요.

## 6. 온보딩/마이페이지 변경 (결정 2)

- **온보딩**: `Step3Newsletter`(주기 선택) 제거. 온보딩 완료 시 구독 자동 생성(`is_active=true`, `newsletter_email = 로그인 이메일`).
- **마이페이지**: 주기 선택(`FREQUENCY_OPTIONS`) 제거 → **수신 on/off 토글 + 수신 이메일**만 유지.
- `frequency` 컬럼/타입은 폐기(삭제하지 않고 미사용 — 마이그레이션 리스크 회피).

## 7. AGENTS §14 갱신 필요

현 §14와 달라진 점(머지 시 함께 수정):
- 발송 시각/주기: "매일 8시 + per-user daily/weekly/none" → **어드민 전역 설정(요일 배열 + 시각)**.
- 템플릿: "React Email" → **HTML 빌더(archive-template 패턴 재사용)**.
- 수신거부 링크 법적 필수: 유지.

## 8. 과제 분해 / 신규 항목

| 항목 | 내용 | 모델 | 지시서 |
|---|---|---|---|
| #40 | 카드뉴스 HTML 템플릿(`newsletter-template.ts`) | Opus설계→구현 | 24 |
| #41 | Cron 발송 + 수신자/콘텐츠 쿼리 + 수신거부 + 온보딩/마이페이지 정리 | Sonnet | 24 |
| #42 | 어드민 설정 UI·미리보기·수동발송·이력·오픈율(Resend webhook) | Sonnet | 25 |
| #41-DB | 뉴스레터 스키마(본 SQL) | (선행) | — |

신규로 추가된 실질 과제는 **발송 이력/오픈율 데이터 모델**(SQL) 하나뿐. 나머지(콘텐츠 선정·빈도 분기·수신거부)는 위 항목에 흡수.
