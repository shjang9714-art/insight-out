# 지시서 537-fix — 도메인 편집·SP 값 env화·확인창 표준화

> 플래너(Opus) · 2026-08-19 · 브랜치 `agent/537-sso-admin` (tip `62f7e36` 위에 이어서)
> 537 diff 리뷰 결과 3건. **①이 실질이고 나머지 둘은 정리다.**

## ① 등록 후 도메인을 붙이거나 떼 방법이 화면에 없다 (플래너 지시서 누락)

David 의 도입 계획은 "도메인 없이 먼저 등록 → IdP 검증 → 그다음 도메인을 묶는다"이다.
현재 화면에서 PUT 을 호출하는 곳은 `disabled` 토글뿐이라 **두 번째 단계를 수행할 수 없다.**
537 지시서가 행 동작을 "활성/비활성 토글, 삭제"로만 적은 탓이다.

### 1-a) 서버 — 빈 배열을 조용히 무시하지 말 것

`src/app/api/admin/sso/providers/[id]/route.ts` 의 `parseUpdateInput` 은 지금
`if (domains.length > 0) input.domains = domains` 라 **`domains: []`(전체 해제 의도)가
키째로 사라지고 GoTrue 는 기존 도메인을 유지한 채 200 을 돌려준다.**
요청은 성공했는데 아무 일도 안 일어나는, 이 코드베이스에서 반복된 조용한 무시 패턴이다.

→ **update 경로에서만** 빈 배열을 그대로 전달한다.

```ts
// [id]/route.ts — parseUpdateInput 안, domains 분기
const domains = body.domains.map((domain) => domain.trim()).filter(Boolean)
input.domains = domains        // 빈 배열도 그대로 보낸다(해제 의도)
```

POST(`providers/route.ts`)는 **현행 유지** — 신규 등록에서 빈 배열은 "지정 안 함"이 맞다.

⚠️ GoTrue 가 `domains: []` 를 어떻게 처리하는지는 문서에 명시가 없다. 거부하면 그 응답을
그대로 화면에 띄우면 된다(가시성 원칙). **임의로 삼키지 말 것.**

### 1-b) 화면 — 행에서 도메인 편집

`src/components/admin/SsoProviderManager.tsx` 의 `관리` 열에 "도메인" 버튼을 추가한다.

- 누르면 그 행에 인라인 입력(쉼표 구분)이 열리고, 현재 도메인이 초깃값으로 채워진다.
- 저장 시 `PUT { domains: [...] }`. 입력을 전부 비우면 `[]` 를 보낸다(= 해제).
- 저장 직전 `useAdminConfirm()` 으로 확인을 받는다. 문구에 **묶는 순간 그 도메인의
  SSO 라우팅이 즉시 살아난다**는 경고를 넣는다.
- 성공하면 `loadProviders()` 로 목록을 다시 읽는다. 낙관적 갱신 금지.

## ② SP 정보 값의 프로젝트 URL 하드코딩 제거

`SsoProviderManager.tsx` 상단의

```ts
const PROJECT_URL = 'https://xalptogjhbiahrbgxhvu.supabase.co'
```

를 `process.env.NEXT_PUBLIC_SUPABASE_URL` 기반으로 바꾼다(끝의 `/` 는 제거).
이 카드의 값은 **IdP 담당자에게 그대로 전달되는 값**이라, 틀린 값이 나가면 SSO 가
조용히 안 된다. 환경변수가 비면 세 카드 대신 "NEXT_PUBLIC_SUPABASE_URL 이 설정되지
않아 SP 정보를 표시할 수 없습니다" 한 줄을 띄운다.

## ③ 삭제 확인창을 공용 컴포넌트로

`window.confirm` → `useAdminConfirm()` (`@/components/admin/ui/AdminConfirm`).
`AdminConfirmHost` 는 `src/app/admin/layout.tsx` 에 이미 마운트되어 있다.

```ts
const confirm = useAdminConfirm()
// ...
const ok = await confirm({
  title: 'SSO 프로바이더 삭제',
  description: '삭제하면 이 IdP 로는 로그인할 수 없습니다.',
  targets: [label],
  destructive: true,
})
if (!ok) return
```

## 하지 않을 것

- 로그인 화면(LoginCard)·`signInWithSSO` 는 여전히 범위 밖이다
- 새 테이블·컬럼
- 도메인 기본값 자동 채우기 — 폼 기본값은 계속 빈 값이다

## 검증

1. `npx tsc --noEmit` / `npx eslint` / `npm run build`
2. 도메인 편집으로 값을 넣었다 빼다 했을 때 **목록에 실제로 반영**되는지
   (특히 전부 비웠을 때 "없음"으로 바뀌는지 — 안 바뀌면 GoTrue 응답을 그대로 보고할 것)
3. 확인창이 공용 다이얼로그로 뜨는지(브라우저 기본 confirm 아님)
4. SP 정보 카드 값이 `NEXT_PUBLIC_SUPABASE_URL` 을 따라가는지
