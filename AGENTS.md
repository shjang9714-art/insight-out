<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version (Next.js 16) has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

특히 다음 사항을 주의:
- 미들웨어 파일명: `src/middleware.ts` 가 아닌 `src/proxy.ts`, export 함수도 `proxy`
- React 19 의 새 컴파일러 동작 (자동 메모이제이션 — `useMemo`/`useCallback` 남발 금지)
- App Router 기본, RSC 가 default
- `cookies()`, `headers()` 등이 async — 반드시 `await` 사용
<!-- END:nextjs-agent-rules -->

---

# Insight Out — 프로젝트 가이드

이 문서는 **바이브 코딩 시 AI 에이전트가 반드시 읽어야 할 단일 진실(SSOT)** 입니다. 작업 전 항상 이 문서를 먼저 읽고, 충돌 시 이 문서가 코드보다 우선합니다.

## 0. 프로젝트 한 줄 정의

**LG U+ B2B 서비스 담당자**를 위한 통합 인텔리전스 플랫폼. 흩어진 시장정보(뉴스/리포트/오피니언)를 수집·큐레이션·요약하고, 선택한 자료로 **AI 전략 보고서**를 생성한다.

- 도메인: **B2B 텔레콤/엔터프라이즈 서비스 시장 정보**
- 사용자: 사내 B2B 서비스(사업) 담당자 (=직장인, 보고서 작성·전략 검토 업무가 일상)
- 톤앤매너: **차분하고 신뢰감 있는 비즈니스 도구**. 게임처럼 화려하거나 컨슈머 앱처럼 가볍지 않다.

## 1. 절대 어기면 안 되는 규칙 (Hard Rules)

| # | 규칙 | 이유 |
|---|---|---|
| 1 | UI 텍스트, 사용자 노출 메시지, 에러 메시지, 주석은 **한국어** | 사용자가 한국 직장인. 영어 혼용 시 신뢰도 하락 |
| 2 | `<html lang="ko">` 로 설정 (현재 코드 `"en"` 은 버그) | 접근성·SEO·브라우저 번역 정확도 |
| 3 | 변수명·함수명·파일명은 **영어** (camelCase / PascalCase / kebab-case) | 코드 검색·linting 호환성 |
| 4 | 비밀키·API 키는 **절대 코드/Git 에 commit 금지** | 공개 repo. 노출 즉시 폐기 비용 발생 |
| 5 | `.env.local` 추가 시 `.env.example` 도 같은 PR 에서 갱신 | 다른 팀원이 막힘 |
| 6 | DB 스키마 변경 시 `supabase/schema.sql` 갱신 | 단일 진실 파일 |
| 7 | 새 테이블 만들 때 **RLS 정책 함께 작성** | 인증 우회 사고 방지 |
| 8 | 클라이언트에서 `SUPABASE_SERVICE_ROLE_KEY` **절대 사용 금지** | 모든 RLS 우회되는 마스터 키. 서버 전용 |
| 9 | 브랜드 컬러는 `--color-brand-*` 변수로만 사용 (`#E6007E` 등 하드코딩 금지) | LGU+ 브랜드 일관성 |
| 10 | 페이지 metadata 는 **각 페이지/레이아웃에서 명시적으로 작성** ("Create Next App" 같은 기본값 방치 금지) | 브랜딩·SEO |
| 11 | 미들웨어는 `src/proxy.ts` 의 `proxy` 함수에만 둠 (Next.js 16 컨벤션) | 다른 파일에 만들면 동작 안 함 |
| 12 | 서버 컴포넌트가 기본, `'use client'` 는 **인터랙션·브라우저 API 가 진짜 필요할 때만** | 번들 크기·SEO·초기 렌더 성능 |

## 2. 기술 스택과 버전 주의사항

| 영역 | 기술 | 주의 |
|---|---|---|
| 프레임워크 | Next.js **16** | App Router, RSC 기본, 미들웨어=proxy.ts |
| 런타임 | React **19** | 새 컴파일러가 자동 메모이제이션, hook 사용 패턴 일부 변경 |
| 언어 | TypeScript (strict) | `any` 사용 금지, 정 필요하면 `unknown` 후 좁히기 |
| 스타일 | **Tailwind CSS v4** | `tailwind.config.js` 없음. 설정은 `globals.css` 의 `@theme inline` 블록 |
| UI 컴포넌트 | **shadcn/ui** (style: `radix-nova`) | `components.json` 확인. 추가는 `npx shadcn@latest add {name}` |
| 아이콘 | **lucide-react** (`lucide-react@1.16`) | 다른 아이콘 라이브러리 추가 금지 |
| 클래스 합성 | `cn()` from `@/lib/utils` (`clsx` + `tailwind-merge`) | 직접 문자열 결합 대신 항상 `cn()` 사용 |
| 인증·DB | **Supabase** (`@supabase/ssr` + `@supabase/supabase-js`) | 절대 `@supabase/auth-helpers-*` 같은 구버전 패키지 추가 금지 |
| 이메일(예정) | Resend 또는 SendGrid | Phase 3 에서 도입 |
| LLM(예정) | 멀티 프로바이더 (OpenAI/Anthropic/Google/Upstage/Cohere) | Phase 3 에서 도입. 추상화 레이어 통해 호출 |

## 3. 폴더 구조 (절대 위치)

```
src/
├── app/                       라우트와 페이지 (App Router)
│   ├── auth/callback/route.ts  OAuth 콜백
│   ├── login/page.tsx          로그인 페이지
│   ├── onboarding/             (예정) 3단계 온보딩
│   ├── dashboard/              (예정) 메인 대시보드
│   ├── reports/                (예정) AI 보고서
│   ├── admin/                  (예정) 관리자 어드민
│   ├── layout.tsx              루트 레이아웃
│   ├── page.tsx                / → /dashboard 리다이렉트
│   └── globals.css             Tailwind v4 설정 + 디자인 토큰
├── components/
│   ├── ui/                     shadcn/ui 컴포넌트 (수동 수정 자제)
│   ├── dashboard/              대시보드 도메인 컴포넌트
│   ├── onboarding/             온보딩 도메인 컴포넌트
│   └── {도메인}/                새 도메인은 새 폴더로
├── lib/
│   ├── supabase/
│   │   ├── client.ts           브라우저 클라이언트 (createBrowserClient)
│   │   └── server.ts           (필요 시) 서버 클라이언트 헬퍼
│   ├── types.ts                도메인 타입 (DB 와 동기화)
│   └── utils.ts                cn() 등 범용 유틸
└── proxy.ts                    미들웨어 (Next.js 16)

supabase/
└── schema.sql                  스키마 + RLS + 시드 (단일 진실)

public/                         정적 파일 (이미지·favicon 등)
```

**경로 alias**: `@/*` → `./src/*`. 항상 `@/components/...`, `@/lib/...` 사용 (상대경로 금지).

## 4. 네이밍 컨벤션

| 대상 | 형식 | 예시 |
|---|---|---|
| 파일 (컴포넌트) | PascalCase | `EditorPick.tsx`, `AIReportModal.tsx` |
| 파일 (그 외 ts) | kebab-case | `mock-data.ts`, `supabase-helpers.ts` |
| 폴더 | kebab-case | `dashboard/`, `auth/callback/` |
| React 컴포넌트 | PascalCase | `function EditorPick()` |
| 함수·변수 | camelCase | `fetchUserProfile`, `isLoading` |
| 타입·인터페이스 | PascalCase | `UserProfile`, `NewsletterSubscription` |
| 상수 (전역) | SCREAMING_SNAKE_CASE | `DEFAULT_PAGE_SIZE` |
| DB 테이블·컬럼 | snake_case | `user_services`, `onboarding_completed` |
| Postgres enum 값 | 가독성 우선 (한국어 가능) | `'Enterprise사업부문'`, `'daily'` |
| 브랜치 | `<type>/<짧은-설명>` (한/영 OK) | `feat/뉴스레터-구독-폼` |
| 커밋 | `<type>: <한국어 요약>` | `feat: 온보딩 2단계 폼 검증 추가` |

`type`: `feat`, `fix`, `chore`, `docs`, `refactor`, `style`, `test`, `perf`.

## 5. 서버 vs 클라이언트 컴포넌트 결정 트리

```
이 컴포넌트가...
├─ useState/useReducer 가 필요? → 'use client'
├─ useEffect 가 필요? → 'use client'
├─ onClick/onChange 등 이벤트 핸들러? → 'use client'
├─ window/document/localStorage 접근? → 'use client'
├─ 위 모두 아님 → 서버 컴포넌트 (기본값, 'use client' 붙이지 말 것)
```

**자주 하는 실수**: 페이지 전체에 `'use client'` 를 붙이면 그 안 모든 컴포넌트가 클라이언트 번들에 들어감. **최소 단위로** 잘라서 인터랙션 있는 leaf 컴포넌트에만 붙이기.

## 6. Supabase 사용 패턴

### 6.1 클라이언트 컴포넌트에서
```tsx
'use client'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()
const { data, error } = await supabase.from('services').select('*')
```

### 6.2 서버 컴포넌트에서
```tsx
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export default async function Page() {
  const cookieStore = await cookies()  // ⚠️ Next.js 16: await 필수
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookies) { cookies.forEach(({name, value, options}) => cookieStore.set(name, value, options)) },
      },
    }
  )

  const { data } = await supabase.from('services').select('*')
  return <div>{/* ... */}</div>
}
```

### 6.3 Route Handler / Server Action 에서
6.2 와 동일한 패턴. `src/app/auth/callback/route.ts` 참고.

### 6.4 절대 하면 안 되는 것
- 클라이언트 컴포넌트에서 `SUPABASE_SERVICE_ROLE_KEY` 임포트
- `createClient` 를 모듈 최상단(컴포넌트 밖)에서 호출해서 전역 변수로 보관
- `process.env.NEXT_PUBLIC_*` 가 아닌 변수를 클라이언트 코드에서 사용

## 7. 인증·인가 (RLS 중심)

### 인증 흐름
1. 사용자가 `/login` 에서 Google OAuth 또는 email 로 로그인
2. Supabase 가 `auth.users` 에 row 생성
3. `handle_new_user()` 트리거가 `public.users` 에 row 자동 생성 (`onboarding_completed=false`)
4. 미들웨어(`src/proxy.ts`)가 `/onboarding` 으로 보냄
5. 온보딩 완료 → `users.onboarding_completed = true` 업데이트
6. 미들웨어가 `/dashboard` 로 보냄

### 미들웨어가 처리하는 가드
- 비로그인 → `/login` 으로 (단, `/login`, `/auth/callback` 예외)
- 로그인했는데 `/login` 접근 → `/dashboard` 로
- 온보딩 미완 → `/onboarding` 으로
- `/admin/*` 에 비관리자 접근 → `/dashboard` 로

**따라서 페이지 컴포넌트에서 인증 체크 코드 중복 작성 금지.** 미들웨어가 이미 처리함.

### RLS 정책 작성 규칙
- 모든 새 테이블은 `enable row level security` 후 정책 작성
- 본인 데이터: `using (auth.uid() = user_id)` 패턴
- 관리자 전체 접근: `using (public.is_admin())` 활용
- INSERT 는 `with check`, SELECT/DELETE 는 `using`, UPDATE 는 둘 다

### service_role 키 사용
- 서버 전용. Route Handler 나 Server Action 안에서만.
- 사용처: 관리자 일괄 작업, 시스템 자동 작업(크롤링 결과 적재 등)
- 환경변수: `SUPABASE_SERVICE_ROLE_KEY` (NEXT_PUBLIC_ 접두사 절대 금지)

## 8. DB 스키마 규칙

### 도메인 어휘 (Glossary)
| 컬럼/타입 | 의미 |
|---|---|
| `user_role` | `'user'` 또는 `'admin'` |
| `department` | 6개 enum: `Enterprise사업부문`, `SMB사업부문`, `공공사업부문`, `기술부문`, `마케팅부문`, `기타` |
| `newsletter_frequency` | `'daily'`, `'weekly'`, `'none'` |
| `services` 테이블 | LGU+ B2B 서비스 7개 (Connectivity, 보안/클라우드, M2M, AICC, AIDC, 모빌리티, 기업솔루션) |
| `user_services.is_pinned` | true 이면 대시보드 상단에 우선 노출 |
| `onboarding_completed` | false 이면 미들웨어가 `/onboarding` 으로 보냄 |

### 새 컬럼 추가 시
- `not null` + `default` 값 함께 작성 (기존 row 가 깨지지 않게)
- `created_at`, `updated_at` 은 `timestamptz default now()` 표준
- 업데이트 컬럼에는 `set_updated_at()` 트리거 연결

### 새 enum 추가/수정 시
- Postgres enum 은 값 삭제가 어려움 → 신중하게
- 추가는 `alter type {name} add value '{value}';`
- TypeScript `src/lib/types.ts` 의 동일 타입도 같이 수정

## 9. UI / 디자인 토큰

### 색상 — 직접 hex 쓰지 말 것
- 기본 UI: Tailwind 의 의미적 토큰 (`bg-background`, `text-foreground`, `border-border`, `text-muted-foreground` 등)
- shadcn 시스템 색상: `bg-primary`, `bg-secondary`, `bg-accent`, `bg-destructive`
- **브랜드 강조** (CTA, 로고 등): `bg-brand-600`, `text-brand-600`, `hover:bg-brand-700`
  - 정의: `globals.css` 의 `--color-brand-{50,100,200,600,700}`
  - hex `#E6007E` (브랜드 600) 직접 사용 금지

### 모서리 (rounded-*)
`--radius-sm` ~ `--radius-4xl` 정의되어 있음. 카드/버튼은 `rounded-lg` 또는 `rounded-xl` 권장. 너무 둥글게(`rounded-3xl` 이상)는 비즈니스 톤과 안 맞음.

### 폰트
- 본문: `font-sans` (Geist Sans 자동 적용)
- 모노스페이스: `font-mono` (Geist Mono)
- 헤딩 별도 폰트 도입 시: `globals.css` 의 `--font-heading` 갱신

### 다크 모드
- `.dark` 클래스 토글로 동작 (현재 토글 UI 는 미구현)
- 새 컴포넌트 만들 때는 다크 변수도 함께 고려 (`dark:bg-...` prefix)

### 간격·레이아웃
- 페이지 컨테이너: `mx-auto max-w-7xl px-4 sm:px-6 lg:px-8`
- 섹션 간격: `space-y-8` 또는 `gap-8`
- 카드 내부 패딩: `p-6`

## 10. shadcn/ui 사용

### 컴포넌트 추가
```bash
npx shadcn@latest add {component-name}
```
`src/components/ui/` 에 자동 추가됨.

### 절대 하면 안 되는 것
- `src/components/ui/` 안 파일을 임의로 수정 (업데이트 시 충돌)
- 수정이 필요하면 wrapper 컴포넌트 만들기: `src/components/MyButton.tsx` 가 `src/components/ui/button.tsx` 를 감싸기

### 자주 쓰는 컴포넌트와 import 경로
```tsx
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
```

## 11. 폼 작성 패턴

현재 별도 폼 라이브러리(`react-hook-form` 등) 미사용. 작은 폼은 `useState` + 네이티브 `<form>` 충분.

대규모 폼 또는 복잡한 검증이 필요해지면 `react-hook-form` + `zod` 도입 검토 (도입 시 이 문서에 반드시 패턴 추가).

### 작은 폼 표준 패턴
```tsx
'use client'
const [value, setValue] = useState('')
const [error, setError] = useState<string | null>(null)
const [isLoading, setIsLoading] = useState(false)

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  setIsLoading(true)
  setError(null)
  try {
    // ... 작업
  } catch (err) {
    setError(err instanceof Error ? err.message : '오류가 발생했습니다.')
  } finally {
    setIsLoading(false)
  }
}
```

### 에러 메시지는 한국어
- 좋음: "이메일 또는 비밀번호가 올바르지 않습니다."
- 나쁨: "Invalid credentials"
- 시스템 에러는 user-friendly 하게: "잠시 후 다시 시도해주세요." + 콘솔에 영문 원본 로그

## 12. AI 보고서 기능 (Phase 3 예정)

미리 알아둘 것:
- **사용자가 명시적으로 트리거할 때만** 생성 (자동 생성 절대 금지)
- 입력: 사용자가 체크한 컨텐츠 리스트 + 보고서 유형
- 보고서 유형: `시장동향`, `경쟁사분석`, `기술트렌드`, `사업기회`, `자유주제`
- 출력: 보고서 미리보기 → PDF/DOCX 다운로드
- **출처 표기 필수** — 어떤 컨텐츠를 근거로 했는지 보고서 끝에 명시
- 환각 방지: 입력 컨텐츠 밖 사실 추론은 명시적으로 표시 ("일반적으로...")

## 13. 데이터 수집 시스템 (Phase 2 예정)

- 자동 크롤링: 매일 오전 7시 (Vercel Cron 또는 별도 워커)
- 데이터 소스: 뉴스 / 웹 인사이트 / Substack·Medium·벤더 블로그 / 가트너·KRG 수동 업로드
- **수집 범위**: 원칙적으로 **당일 발행분만** (관리자 설정으로 최대 30일 소급 가능)
- 중복 제거 3단계: URL 정규화 → 제목 유사도 90%+ → 본문 SHA-256 해시
- 품질 필터: 본문 300자 미만 자동 제외, 광고 키워드 패턴 제외
- 다국어: 영문 컨텐츠는 LLM 으로 **한국어 요약** 자동 생성, **전문 번역은 온디맨드**

## 14. 뉴스레터 발송 (Phase 3 예정)

- 발송 시각: 매일 오전 8시 (수신 동의 사용자에게)
- 주기 옵션: `daily` / `weekly` (월요일 오전 8시) / `none`
- 발송 채널: Resend 또는 SendGrid
- 템플릿: React Email
- 수신 거부 링크 **법적 필수**

## 15. 자주 하는 실수 모음

| 실수 | 올바른 방법 |
|---|---|
| `lang="en"` 방치 | `lang="ko"` |
| `title: "Create Next App"` 방치 | `title: "Insight Out"` + 페이지별 명시 |
| `'use client'` 페이지 전체에 붙이기 | 인터랙티브 leaf 만 |
| `'#E6007E'` 하드코딩 | `bg-brand-600` |
| `useEffect` 안에서 데이터 페치 | 서버 컴포넌트에서 `await supabase...` |
| `useMemo` 자동 사용 | React 19 컴파일러가 자동 처리 — 정 필요할 때만 |
| `src/middleware.ts` 만들기 | `src/proxy.ts` 의 `proxy` 함수에 추가 |
| `.env.local` 만 수정 (`.env.example` 누락) | 두 파일 같이 PR |
| RLS 끄고 테스트 | 로컬 Supabase 인스턴스에서만, 운영 절대 금지 |
| `services` 테이블에 새 row 직접 INSERT | seed 데이터는 `schema.sql` 에 반영 후 운영 적용 |
| 영문 commit 메시지 | 한국어 (prefix 만 영어) |
| `cookies()` 를 await 없이 호출 | `await cookies()` (Next.js 16) |

## 16. PR 체크리스트 (제출 전 본인 확인)

- [ ] 로컬에서 `npm run dev` 정상 동작
- [ ] 로컬에서 `npm run build` 통과
- [ ] `npm run lint` 통과 (또는 의도된 경고만)
- [ ] 한국어 UI 텍스트 사용
- [ ] `'use client'` 가 정말 필요한 위치에만
- [ ] `.env.example` 갱신 (해당 시)
- [ ] `supabase/schema.sql` 갱신 (해당 시)
- [ ] RLS 정책 작성 (새 테이블 추가 시)
- [ ] 출처/근거 데이터를 절대 비밀키로 fetch 하지 않음

## 17. 자주 쓰는 패턴 스니펫

### 17.1 페이지 metadata 작성
```tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '대시보드 | Insight Out',
  description: 'B2B 서비스 시장 정보 통합 대시보드',
}
```

### 17.2 사용자 데이터 조회 (서버)
```tsx
const cookieStore = await cookies()
const supabase = createServerClient(/* ... */)
const { data: { user } } = await supabase.auth.getUser()
if (!user) return null  // 미들웨어가 막아주지만 타입 안전성 위해

const { data: profile } = await supabase
  .from('users')
  .select('*, user_services(service_id, is_pinned, services(*))')
  .eq('id', user.id)
  .single()
```

### 17.3 핀 고정 서비스 목록 조회
```tsx
const { data: pinned } = await supabase
  .from('user_services')
  .select('service_id, services(*)')
  .eq('user_id', user.id)
  .eq('is_pinned', true)
```

### 17.4 조건부 클래스
```tsx
import { cn } from '@/lib/utils'

<button className={cn(
  'rounded-lg px-4 py-2 font-medium',
  isPrimary ? 'bg-brand-600 text-white hover:bg-brand-700' : 'bg-secondary text-foreground',
  isDisabled && 'opacity-50 cursor-not-allowed',
)}>
```

### 17.5 빈 상태 (empty state)
```tsx
{items.length === 0 ? (
  <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
    아직 등록된 항목이 없습니다.
  </div>
) : (
  items.map(/* ... */)
)}
```

## 18. 의사결정 기록 (도입 검토 중)

추후 `docs/ADR/` 폴더에 Architecture Decision Records 형식으로:
- 폼 라이브러리 도입 결정
- 차트 라이브러리 선택 (Recharts vs ECharts vs Visx)
- LLM 게이트웨이 (LiteLLM 도입 여부)
- 크롤링 워커 호스팅 (Vercel Cron vs 별도)

지금은 `package.json` 의 dependency 추가가 곧 결정. 추가 시 PR 설명에 **왜 이 라이브러리인지** 반드시 적기.

## 19. AI 에이전트(Claude/Cursor 등)에게

이 프로젝트에서 작업할 때:
1. 새 파일 만들기 전 **이 문서를 다시 읽기**
2. 위 1번 절대 규칙 12개를 위반하지 않는지 자가 검증
3. 새 외부 라이브러리 추가 전 사용자에게 의도 확인
4. 큰 리팩토링이나 폴더 구조 변경은 PR 분리 + 의도 명시
5. 기존 코드 스타일 (들여쓰기·인용부호·주석 톤) 을 따라가기 — 일관성이 가독성

**불확실하면 코드를 만들기 전에 묻기.** 이 프로젝트는 학습 + 실제 배포를 겸하는 팀 프로젝트이므로, 잘못된 추론보다 확인이 낫다.

---

## 20. 작업 사이클 — Git 표준 흐름 (공동 작업 필수)

**모든 작업의 시작과 끝은 git 동기화입니다.** 공동 작업 환경에서 충돌과 꼬임을 방지하는 핵심 습관. 바이브 코딩 시 AI 도 이 사이클을 반드시 따른다.

### 20.1 한 줄 요약

```
git pull → 작업 → git pull → commit → git pull --rebase → push → 노션 기록 (개발 일지 + 작업 DB 상태)
```

### 20.2 작업 시작 (필수, 3초)

```bash
cd ~/insight-out
git checkout main
git pull
```

수희(또는 다른 팀원)가 방금 push 한 것을 못 받으면 모든 게 꼬임. 예외 없음.

### 20.3 작업 종료 (필수)

```bash
git add <변경 파일>
git commit -m "<type>: <한국어 요약>"
git pull --rebase
git push
```

`pull --rebase` 가 핵심: push 직전에 누가 또 올렸을 수 있으니 한 번 더 sync, 본인 commit 을 그 위에 얹는 방식.

### 20.4 30분 이상 작업 시 — 중간 sync

```bash
git pull --rebase
```

중간에 한 번씩 끼워 넣기. 마지막에 큰 충돌 풀기보다 조각으로 푸는 게 쉬움.

### 20.5 언제 main 직접 push? 언제 브랜치?

| 작업 성격 | 방식 |
|---|---|
| 작은 polish (오타, 색상, 1~2줄 버그 fix) | main 직접 push |
| 큰 기능 추가 (30분 이상 작업) | 브랜치 + PR |
| 여러 작업 묶음 | 브랜치 + PR |
| AGENTS.md 같은 규칙 변경 | 브랜치 + PR |
| DB 스키마 변경 | 브랜치 + PR (필수) |
| 환경변수 추가 | 브랜치 + PR (필수, owner 에게 알림) |

#### Opus↔Sonnet 협업 루프에서의 커밋 타이밍
- **지시서(`docs/sonnet-지시서/*`)는 위임 전에 커밋·푸시하지 않는다.** Claude Code(Sonnet)는 같은 워킹트리의 로컬 지시서를 직접 읽으므로 레포에 먼저 올릴 필요 없음.
- **커밋·푸시는 Opus 검증 통과 후 끝에 한 번** — 지시서 + 코드를 묶어서. (불필요한 push 사이클·"작업물 없이 지시서만 먼저 올림" 방지)
- **예외**: 수희가 Supabase 에서 실행할 산출물(SQL 핸드오프 등)은 미리 커밋·푸시해 수희가 받게 한다.
- 루프 전체 정의: [`docs/작업-루프.md`](./docs/작업-루프.md).

### 20.6 충돌(conflict) 발생 시

`git pull` 또는 `git push` 가 다음을 보내면:

```
CONFLICT (content): Merge conflict in <file>
```

대응:
1. 충돌 파일 열기 → `<<<<<<<`, `=======`, `>>>>>>>` 마커 확인
2. 어느 쪽 살릴지 결정 → 마커 제거 + 정리
3. `git add <file>` → `git rebase --continue` (또는 `git commit` if merge)
4. `git push`

당황하지 말 것. 코드는 안 사라진다.

### 20.7 push 거부될 때

```
! [rejected]  main -> main (fetch first)
```

이렇게 뜨면:
```bash
git pull --rebase
git push
```

대부분 이걸로 풀림.

### 20.8 작업 후 기록 (필수, 2단계) — 담당: **Sonnet(Claude Code)**

> **기록 담당 = Claude Code(Sonnet).** Notion(① 개발 일지 · ② 작업 DB · 작업계획서 신호등)과 git `docs/작업계획서.md` 동기화는 **Sonnet 이 수행**한다(Claude Code 에 Notion 커넥터 연결됨). Opus(Cowork)는 **직접 기록하지 않는다.**
> **표준 루틴**: [`docs/기록-동기화-루틴.md`](./기록-동기화-루틴.md) (Notion id·속성·매핑·절차 SOP). David 트리거 한 줄 = `"기록 동기화 루틴대로 동기화해줘"`. 개별 동기화 지시서는 더 만들지 않고 이 루틴을 따른다. 예외: 커넥터 장애 시에만 Opus 대행.

push 끝나면 노션에 두 가지를 갱신한다. ①은 모든 push 후 필수, ②는 작업 DB 항목이 있을 때만.

#### ① 개발 일지 DB 에 한 줄 추가 — 모든 push 후 필수

- URL: <https://www.notion.so/bc50b27c33b64af78ecb70ee54c8c80a>
- 필드:
  - `제목` (title): 변경 요약 한 줄
  - `유형` (select): `커밋` / `PR` / `배포` / `검증` / `기타` 중 하나
  - `작업자` (select): `수희` 또는 `David`
  - `날짜` (date): 오늘
  - `브랜치` (text): 작업한 브랜치명 (예: `chore/로고-파비콘-개편`)
  - `링크` (url): commit URL 또는 PR URL
  - `내용` (text): 무엇을 / 왜 (한두 문장)
  - `관련 작업` (relation, 선택): 해당 push가 작업 DB 의 특정 항목과 연관되면 그 페이지 링크

#### ② 작업 DB 상태 갱신 — 작업 DB 에 해당 항목이 있을 때만

- URL: <https://www.notion.so/dd9050f8ffc8451db18475abd03166d4>
- 갱신 필드:
  - `상태` (select): `Todo` → `In Progress` → `Done` (또는 `Blocked`)
  - `메모` (text): 완료 컨텍스트 — 예) `"완료: 2026-MM-DD, PR #N (브랜치명). 핵심 변경 요약"`

작업 DB 에 항목이 없는 push (오타 수정 같은 가벼운 polish)는 ② 생략 OK. ①은 모든 push 후 필수.

**미래 자동화**: GitHub Actions → Notion 자동 일지 (작업 DB 항목과 매칭해서 상태도 자동 갱신).

### 20.9 AI 에이전트에게 (바이브 코딩 시)

이 사이클을 매번 자연스럽게 따라간다:

1. **작업 시작 시**: `git status` 와 `git pull` 실행 여부 확인. 안 했다면 사용자에게 권유.
2. **작업 중**: 30분 이상 걸리면 중간 `git pull --rebase` 권유.
3. **작업 끝낼 때**: commit 메시지 형식(`type: 한국어 요약`) 지키고, push 전 마지막 `git pull --rebase` 권유.
4. **기록은 Sonnet(Claude Code) 담당** (§20.8). push 후:
   - **Opus(Cowork)**: 무엇을 기록할지 "기록 지시서"(Notion 페이지/DB id·값 + git `docs/작업계획서.md` 변경)를 작성해 David 에게 넘긴다. 직접 Notion/작업계획서 기록은 하지 않는다.
   - **Sonnet(Claude Code)**: 지시서대로 Notion(개발 일지 ① + 작업 DB ② + 작업계획서 신호등)과 git `docs/작업계획서.md` 를 갱신하고 결과 URL 보고. (Claude Code 에 Notion 커넥터 연결됨)
   - 두 단계: ① 개발 일지 추가(모든 push), ② 작업 DB 상태 갱신(해당 항목 있을 때만).
5. **커넥터 장애 등 예외 시에만** Opus 가 대행하거나, David 에게 필드별 값을 안내해 수동 입력하도록 한다.
