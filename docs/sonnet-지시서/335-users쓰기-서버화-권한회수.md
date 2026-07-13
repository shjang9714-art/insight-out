# 지시서 335 — `users` 쓰기 전면 서버화 + `authenticated` UPDATE 권한 회수

> 작성: Opus(플래너) · 2026-07-13 · 근거: `docs/인증개편-현황분석-2026-07-13.md` §8-1·§8-2
> 협업 루프: 로컬(커밋X). 위임 → 구현 → 재현검증 → "커밋해" → 커밋·병합·푸시.
> **SQL 있음 — `docs/sql-handoff/336-users-update-권한회수.sql` (⛔ 코드 배포 *후*에 적용. 순서 뒤집으면 온보딩·마이페이지가 죽는다)**
> 선행: SQL `334-보안-role-자기승격-차단.sql` (임시 방어). 이 지시서는 **그 임시 방어를 불필요하게 만드는 근본 수정**이다.
> ⚠️ **`nav.ts`·`admin/page.tsx`를 건드리지 말 것** (330·331 소유)

---

## 0. 한 줄

**`authenticated`가 `public.users`를 직접 쓸 수 있는 한, `role` 자기승격은 트리거로 *덮는* 것밖에 못 한다.** 쓰기 경로 5곳을 전부 서버(service_role + 컬럼 화이트리스트)로 옮기고, **`authenticated`의 `users` UPDATE 권한을 회수한다.**

---

## 1. 현행 진단 (2026-07-13 워킹트리 확인)

### 1.1 🔴 구멍의 구조

```
RLS "users: 본인 수정" (schema.sql:122-125)
  → 본인 행 UPDATE 를 **컬럼 제한 없이** 허용

lock_approval_columns() (2026-06-18 SQL:40-52)
  → approval_status / approved_at / approved_by 만 되돌림
  → role 은 안 건드림  ← 구멍

role 을 보호하는 트리거·정책·GRANT: grep 0건
```
`role`은 **신뢰의 뿌리**다 — `middleware.ts:128` · `requireAdmin()`(`actions.ts:31`) · RLS `is_admin()` **셋 다 같은 컬럼**을 본다.

### 1.2 ⭐ 왜 트리거만으로는 부족한가

334 SQL이 `new.role := old.role;`을 넣으면 승격은 막힌다. **하지만 그건 "몰래 바꾸면 조용히 되돌린다"는 방어다** — 인수인계 §4-1이 지목한 **graceful-silent를 우리가 일부러 만드는 것**이다.

**진짜 답은 `authenticated`가 `users`를 아예 못 쓰게 하는 것**이고, 그러려면 **쓰기 경로를 먼저 서버로 옮겨야 한다.** 지금은 옮길 수 없어서 트리거에 의존하고 있다.

### 1.3 `authenticated` 키로 `users`를 쓰는 경로 — **5곳** (전수 확인)

| # | 파일:라인 | 클라이언트 | 쓰는 컬럼 |
|---|---|---|---|
| 1 | `src/app/onboarding/page.tsx:51,60` | `@/lib/supabase/client` (브라우저) | `name` · `team` · `default_lens` · `onboarding_completed` |
| 2 | `src/app/dashboard/mypage/page.tsx:151` | `@/lib/supabase/client` (브라우저) | `name` · `department` · `team` |
| 3 | `src/app/dashboard/mypage/page.tsx:255` | 〃 | `default_lens` |
| 4 | `src/app/api/preferences/bootstrap/route.ts:36` | `@/lib/supabase/server` (사용자 세션) | `feed_categories` · `feed_onboarding_skipped` |
| 5 | `src/app/api/preferences/skip/route.ts:12` | 〃 | `feed_onboarding_skipped` |
| 6 | `src/app/api/me/seen/route.ts:26` | 〃 | `last_seen_at` |

> ⚠️ 4~6은 **API 라우트지만 service_role이 아니다.** `@/lib/supabase/server`는 사용자 세션 클라이언트다 — RLS를 그대로 탄다. **서버에 있다고 안전한 게 아니다.**

### 1.4 대조 — service_role을 쓰는 유일한 곳
`src/app/admin/users/actions.ts:37` (`SUPABASE_SERVICE_ROLE_KEY`) — `role`·`approval_status`를 여기서만 정당하게 바꾼다. **이 파일은 건드리지 않는다.**

### 1.5 `users` 쓰기 컬럼 전수 (회수 후 서버가 대신 써야 할 것)
```
name · department · team · default_lens · onboarding_completed
feed_categories · feed_onboarding_skipped · last_seen_at
```
**이 8개가 전부다.** `role`·`approval_status`·`approved_at`·`approved_by`·`email`·`id`는 **사용자가 쓸 일이 없다.**

---

## 2. DB / SQL

**`docs/sql-handoff/336-users-update-권한회수.sql`** — 이 지시서와 **동반**이지만 **순서가 있다.**

```
⛔ 반드시 이 순서:
   1. 이 코드를 배포한다 (쓰기가 전부 service_role 경로로 바뀐 뒤)
   2. 화면에서 온보딩·마이페이지 저장이 되는지 확인한다
   3. 그 다음에 336 SQL(revoke)을 적용한다

순서를 뒤집으면 온보딩·마이페이지 저장이 즉시 죽는다.
```

코드는 **revoke 전에도 후에도 동작해야 한다**(루틴 §6 — graceful). service_role로 쓰므로 자연히 그렇다.

---

## 3. 구현

### 3-1. ⭐ 서버 전용 `users` 업데이트 모듈 — **컬럼 화이트리스트를 코드로 강제**

`src/lib/users/update-profile.ts` (신설)

```ts
import 'server-only'

/** 사용자가 스스로 바꿀 수 있는 컬럼 — 이 목록에 없으면 못 쓴다. */
const SELF_WRITABLE = [
  'name', 'department', 'team', 'default_lens', 'onboarding_completed',
  'feed_categories', 'feed_onboarding_skipped', 'last_seen_at',
] as const
export type SelfWritableColumn = typeof SELF_WRITABLE[number]

/** ⛔ 절대 사용자가 못 쓰는 컬럼 — 하나라도 들어오면 throw */
const FORBIDDEN = ['role', 'approval_status', 'approved_at', 'approved_by', 'id', 'email'] as const

export async function updateOwnProfile(
  userId: string,
  patch: Partial<Record<SelfWritableColumn, unknown>>,
) {
  for (const k of Object.keys(patch)) {
    if ((FORBIDDEN as readonly string[]).includes(k)) {
      throw new Error(`[updateOwnProfile] 금지된 컬럼: ${k}`)   // 조용히 무시하지 말 것
    }
    if (!(SELF_WRITABLE as readonly string[]).includes(k)) {
      throw new Error(`[updateOwnProfile] 허용되지 않은 컬럼: ${k}`)
    }
  }
  // service_role 클라이언트로 .eq('id', userId) 로만 UPDATE
}
```

**규칙을 주석으로 부탁하지 않는다**(루틴 §5.2). 금지 컬럼이 들어오면 **throw**한다. 조용히 필터링하면 다음 사람이 "왜 안 저장되지"로 헤맨다.

- `userId`는 **반드시 서버에서 세션으로 얻는다**(`supabase.auth.getUser()`). **클라이언트가 보낸 id를 믿지 말 것** — 그러면 남의 프로필을 고칠 수 있다.

### 3-2. 쓰기 경로 6곳 이관

| # | 현재 | 이후 |
|---|---|---|
| 1 | `onboarding/page.tsx` 클라이언트 upsert | **서버 액션** `completeOnboarding(data)` → `updateOwnProfile` |
| 2·3 | `mypage/page.tsx` 클라이언트 update ×2 | **서버 액션** `saveProfile(data)` · `saveDefaultLens(lens)` |
| 4 | `api/preferences/bootstrap` | `updateOwnProfile` 사용 (세션에서 userId) |
| 5 | `api/preferences/skip` | 〃 |
| 6 | `api/me/seen` | 〃 |

- **읽기(SELECT)는 그대로 둔다.** RLS `users: 본인 조회`는 유지. 회수하는 건 **UPDATE/INSERT뿐**이다.
- 온보딩의 `42703` 폴백(`default_lens` 컬럼 미적용 시)은 **서버 액션 안에서 그대로 유지**할 것.

### 3-3. `users` INSERT도 회수 대상이다
RLS `users: 본인 추가`(`schema.sql:118-120`)가 살아 있다. 하지만 `public.users` 행은 **DB 트리거 `handle_new_user()`가 만든다**(`schema.sql:89-101` / `240 SQL:35`).
→ **앱에서 `users`를 INSERT하는 코드가 있는지 확인하고, 없으면 INSERT 정책도 336에서 회수한다.**
```
확인: grep -rn "from('users')" -A 3 src/ | grep "insert(" → 결과를 보고에 첨부할 것
```
(온보딩의 `upsert`는 이미 행이 있으므로 실질 UPDATE지만, **upsert는 INSERT 권한을 요구한다** — 서버 액션으로 옮기면 이 문제도 사라진다.)

---

## 4. 회귀 가드

- ⛔ **`nav.ts`·`admin/page.tsx`·`AdminOpsSignals`를 건드리지 말 것** (330·331 소유).
- ⛔ **`src/app/admin/users/actions.ts`를 건드리지 말 것.** 유일하게 정당한 `role` 쓰기 경로이고 이미 service_role이다.
- ⛔ **`users` SELECT(RLS 본인 조회 / admin 전체 조회)를 건드리지 말 것.** 화면 전체가 죽는다.
- **`handle_new_user()` 트리거를 건드리지 말 것.** 신규 가입 시 행 생성이 여기서 난다.
- **⭐ 클라이언트가 보낸 `id`를 절대 믿지 말 것.** 서버 세션의 `auth.getUser()`로만 대상을 정한다. **안 그러면 남의 프로필을 고치는 더 큰 구멍이 된다.**
- **온보딩이 안 깨질 것** — 완료 못 하면 미들웨어(`:107-109`)가 모든 경로를 `/onboarding`으로 되돌린다. **여기가 깨지면 아무도 로그인 못 한다.** 가장 위험한 지점이다.
- **`default_lens` 42703 폴백 유지**(SQL 미적용 환경 대비, `onboarding/page.tsx:58-62`).
- **309 배선 유지** — 마이페이지 렌즈 변경 시 `localStorage 'io:lens'` + `dispatchEvent('lens:changed')` (`mypage/page.tsx:262-263`). 서버 액션으로 옮겨도 **클라이언트 쪽 dispatch는 남아야 한다.**
- **`api/me/seen`은 매 방문 호출된다.** service_role로 바뀌어도 **비차단·저비용**이어야 한다. 실패해도 화면이 안 죽어야 한다.

## 5. 검증

- `npx tsc --noEmit` 0 / `npx eslint` 0 / `npm run build` **통과 (반드시 네가 돌릴 것 — 플래너 샌드박스는 Bus error로 못 돌린다)**
- ⭐ **`grep -rn "from('users')" -A 3 src/ | grep -E "update\(|upsert\(|insert\("`**
  → **`src/app/admin/users/actions.ts` 와 `src/lib/users/update-profile.ts` 외에는 0건**이어야 한다. 결과를 보고에 첨부할 것.
- ⭐ **금지 컬럼 throw 재현**: `updateOwnProfile(uid, { role: 'admin' })` 를 호출하는 임시 코드를 넣어 **throw 하는지 확인**하고 되돌릴 것. throw 안 하면 §3-1이 무의미하다.
- **온보딩 전 구간**: 신규 계정으로 이름·팀·렌즈·서비스 입력 → 완료 → `/dashboard` 진입되는지
- **마이페이지**: 기본 정보 저장 · 기본 보기 변경 → **콘텐츠 화면에 즉시 반영**되는지(309)
- **336 SQL 적용 전에도 동작하는지** (service_role은 RLS 무관하므로 당연히 동작해야 한다)

## 6. 후속(범위 밖)

- **336 SQL 적용** — 코드 배포·화면 확인 **후에** (§2)
- **도메인 게이팅 fail-closed** — `handle_new_user()`에 도메인 검사 이중화. 지금은 Supabase 대시보드 Hook이 **유일한 차단선**이다 (별도 슬라이스)
- **프로필 캐시 TTL 15분** → 단축 + 강등 시 즉시 무효화 (`profile-cache-cookie.ts:5`)
- **HMAC 서명 키를 `SUPABASE_SERVICE_ROLE_KEY`에서 분리** (`profile-cache-cookie.ts:16`)
- 인증 방식 자체(비밀번호 도입 여부) — **D1 결정 대기**
