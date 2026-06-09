# 지시서 27 — [#66] 아카이브 사이드패널 노출 + 메일 발송 실패 수정

> 작성: Opus(Cowork) · 대상: 구현 에이전트(Claude Code) · 검증: Opus · 커밋: 구현 에이전트
> ⚠️ 작업 전 `AGENTS.md` + `src/components/dashboard/Sidebar.tsx` + `src/components/dashboard/EmailArchiveWidget.tsx` + `src/components/archive/ArchiveButton.tsx` + `src/app/api/email/send-archive/route.ts` + `src/lib/email/archive-template.ts` + `src/app/api/webhooks/resend/route.ts` 를 읽을 것. `npm install` 먼저.
> 범위: **(A) 사이드패널에 아카이브가 안 보이는 문제 + (B) 일부 사용자 메일 발송 실패.** 진단(Opus 가설) → 코드 수정(Sonnet) + 인프라 액션(수희) 분리. 새 테이블 없음. RLS는 기존 "본인 조회" 정책 존재(추가 정책 불필요 확인됨).

---

## 파트 A — 아카이브 사이드패널 미표시

### A-0. 진단 (가설 — 구현 전 코드/콘솔로 확인)

`Sidebar.tsx`는 마운트 시 1회 `from('archives').select('archive_items(added_at, contents(id,title,category))')` 조회한다. RLS는 `archives/archive_items: 본인 조회` 정책이 이미 존재(`supabase/2026-05-30-콘텐츠-북마크-04-rls.sql`)하므로 **권한 문제는 아닐 가능성이 높다.** 유력 원인 순서로 확인:

1. **갱신 부재(최우선 가설)**: `ArchiveButton`에서 새로 담아도 `Sidebar`는 별도 마운트된 클라이언트 컴포넌트라 **재조회하지 않음** → 전체 새로고침 전까지 미표시. → "방금 담았는데 사이드에 안 보인다"는 전형적 증상.
2. **빈 아카이브 필터**: 아카이브는 있으나 `archive_items`가 없으면 `items`가 비어 "담아둔 콘텐츠 없음"으로 보임(정상 동작이나 사용자는 버그로 인지 가능).
3. **조인 형태**: 콘솔에서 위 쿼리 응답이 실제로 행을 반환하는지 확인(`data` 로깅). `contents` SELECT 정책 부재 시 nested가 빈 배열 → 그 경우만 SQL 보강(아래 A-2, 조건부).

> 구현 전 1·2를 콘솔/네트워크로 먼저 확정하고 보고에 근거를 남길 것. 대부분 1번이 정답일 것으로 본다.

### A-1. 수정 (갱신 메커니즘 — 라이브러리 추가 없이)

- **이벤트 브로드캐스트**: `ArchiveButton`의 `handleAdd`/`handleCreate` 성공 직후
  ```ts
  window.dispatchEvent(new CustomEvent('archive:changed'))
  ```
  를 발행.
- `Sidebar`는 조회 로직을 `loadArchives()` 함수로 추출하고, `useEffect`에서 (1) 최초 1회 호출 + (2) `window.addEventListener('archive:changed', loadArchives)` 등록(언마운트 시 해제). 같은 패턴을 `EmailArchiveWidget`에도 적용(담기 후 카운트 갱신).
- 방어적으로 `Sidebar` 쿼리에 사용자 확정 후 `from('archives').select('... ').eq('user_id', user.id)` 형태로 명시(현재 RLS 의존). `auth.getUser()` 먼저 호출.

### A-2. (조건부) SQL — A-0의 3번이 사실로 확인될 때만

`contents`에 authenticated SELECT 정책/GRANT가 없어 nested가 비는 경우에만 `supabase/2026-06-09-콘텐츠-읽기정책.sql`(멱등) 작성 — **AGENTS/프로젝트 규칙대로 anon·authenticated GRANT + RLS select 정책**. 핸드오프(수희 실행). 확인되지 않으면 작성하지 말 것(불필요 SQL 금지).

---

## 파트 B — 메일 발송 실패 (Resend)

### B-0. 진단 (Opus 가설 — 강함)

`send-archive/route.ts`의 발신자 기본값이 `RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'`. **Resend의 `onboarding@resend.dev` 샌드박스 발신자는 "Resend 계정 소유자 본인의 검증된 이메일"로만 전송 가능**하다. 따라서 **수신자가 그 외 임직원 주소(@lguplus 등)면 전 건 실패** → "일부 사용자만 실패" 증상과 일치. 또한 현재 코드는 `sendError`를 콘솔에만 남기고 클라이언트엔 일반 메시지만 반환 → 원인 진단이 어려움.

### B-1. 인프라 액션 (수희 — 코드 아님)

- Resend 대시보드에서 **도메인 검증**(SPF/DKIM) 완료 → 검증 도메인 발신 주소(예: `noreply@<verified-domain>`)를 Vercel 환경변수 `RESEND_FROM_EMAIL`에 설정(Production/Preview 스코프 모두). 값은 한글·따옴표·공백 금지.
- 도메인 검증 전까지는 본인 외 주소로 발송 불가임을 인지(임시로 본인에게만 테스트).
- → 지시서에는 "수희 핸드오프"로 명시. Sonnet은 B-2만 구현.

### B-2. 코드 수정 (Sonnet)

- **에러 표면화**: `send-archive/route.ts`에서 `sendError`가 있을 때 `sendError.name`/`sendError.message`를 서버 로그에 구조적으로 남기고, 응답 JSON에 진단 가능한 메시지를 포함(민감정보 제외). 예: 검증 도메인 미설정/수신 거부 등 카테고리화. `EmailArchiveWidget`은 받은 메시지를 사용자에게 그대로 노출(현재 generic 문구 대체).
- **발신자 가드**: `RESEND_FROM_EMAIL` 미설정 시 콘솔 경고 + 응답에 "발신 도메인 미설정" 안내(조용한 onboarding fallback로 인한 silent 실패 방지).
- **수신 주소 로깅**(서버 only): 어떤 수신자에서 실패했는지 로그로 추적 가능하게(개인정보는 응답 본문에 넣지 말 것 — 서버 로그 한정).
- (선택) `webhooks/resend` 핸들러가 bounce/complaint 이벤트를 받는지 확인하고, 미처리면 최소 로깅만 추가.

---

## 완료 조건
- [ ] A 진단 근거(콘솔/네트워크)로 원인 확정 후 보고에 기재
- [ ] A `archive:changed` 이벤트로 Sidebar·EmailArchiveWidget 실시간 갱신(라이브러리 추가 없음), 쿼리 `user_id` 명시
- [ ] A SQL은 contents 읽기정책 부재가 **확인된 경우에만** 멱등 작성(anon·authenticated GRANT+정책, 수희 핸드오프)
- [ ] B 진단 결론(`onboarding@resend.dev` 제약) 보고 + 수희 인프라 액션 명시
- [ ] B `send-archive` 에러 표면화·발신자 가드·서버 로깅, `EmailArchiveWidget` 구체 메시지 노출
- [ ] service_role 미노출, 스키마 무변경
- [ ] `npx tsc --noEmit` · `npm run build` · `npm run lint`(신규 0) 통과

## 보고 양식
```
## 완료 보고 — 지시서 27 (#66) 사이드패널 + Resend
- A 원인 진단: <확정 원인 + 근거>
- A 수정: <이벤트 갱신/쿼리/SQL 여부>
- B 원인 진단: <Resend from 제약 등>
- B 수정(코드): <에러 표면화/가드>  · 수희 핸드오프: <도메인 검증·RESEND_FROM_EMAIL>
- SQL: <작성 여부/파일명 또는 "불필요(읽기정책 존재)">
- 검증: tsc · build · lint
- 미해결: <없으면 "없음">
```
