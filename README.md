# Insight Out

LG U+ B2B 서비스 담당자를 위한 통합 인텔리전스 플랫폼. 흩어진 뉴스·리포트·오피니언을 한 곳에서 모아 보고, LLM 기반 전략 보고서까지 만들어내는 워크플로우 플랫폼.

배포: https://insight-out-app.vercel.app

> 자세한 제품 정의는 PRD 와 기획서 (팀 Notion) 참고

---

## 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 프레임워크 | Next.js 16 (App Router) + React 19 + TypeScript |
| 스타일 | Tailwind CSS v4 + shadcn/ui (radix-nova) |
| DB / 인증 | Supabase (PostgreSQL + Auth + Storage) |
| 배포 | Vercel |
| 협업 | GitHub |

> ⚠️ Next.js 16은 최신 버전이라 학습된 패턴과 다를 수 있습니다. 코드 작성 전 [`AGENTS.md`](./AGENTS.md) 를 먼저 읽으세요.

---

## 로컬 셋업 (처음 한 번)

### 1) 사전 준비
- Node.js 20 이상
- npm 10 이상
- Supabase 프로젝트 (팀 owner 가 미리 생성해둠)
- `.env.local` 에 들어갈 키 값 (팀 owner 에게 안전한 채널로 요청)

### 2) 설치
```bash
git clone https://github.com/shjang9714-art/insight-out.git
cd insight-out
npm install
```

### 3) 환경변수 세팅
```bash
cp .env.example .env.local
# .env.local 을 열어 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY 값 입력
```

### 4) 실행
```bash
npm run dev
```
브라우저에서 `http://localhost:3000` 접속 → 로그인 페이지로 리다이렉트됨.

---

## Supabase 프로젝트 셋업 (팀 owner 만 1회)

### DB 스키마 적용
1. Supabase Dashboard → SQL Editor 진입
2. `supabase/schema.sql` 전체 내용 복사 → 실행
3. Table Editor 에서 `users`, `services`, `user_services`, `newsletter_subscriptions` 4개 테이블 생성 확인
4. `services` 테이블에 8개 row 가 자동 입력되어 있는지 확인 (STAGE, BizWork, GovLink, CloudOps, DataBridge, SecureVault, ConnectAPI, InsightAds)

### Google OAuth 활성화
1. [Google Cloud Console](https://console.cloud.google.com/) → OAuth 2.0 클라이언트 ID 생성
   - Authorized redirect URIs 에 다음 추가:
     - `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`
2. Supabase Dashboard → Authentication → Providers → Google 활성화
   - Client ID, Client Secret 입력
3. Supabase Dashboard → Authentication → URL Configuration
   - Site URL: `http://localhost:3000` (개발) 또는 Vercel URL (운영)
   - Redirect URLs: `http://localhost:3000/auth/callback`, `https://insight-out-app.vercel.app/auth/callback`

---

## Vercel 배포 (팀 owner 만 1회)

1. Vercel Dashboard → Add New Project → GitHub repo `insight-out` import
2. Framework Preset: `Next.js` (자동 감지)
3. Environment Variables 등록 (Production / Preview / Development 모두 체크)
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy 클릭

이후 `main` 브랜치 merge 시 운영 자동 배포, PR 시 Preview URL 자동 생성됨.

---

## 폴더 구조

```
src/
├── app/
│   ├── auth/callback/    OAuth 콜백 라우트
│   ├── dashboard/        메인 대시보드 (예정)
│   ├── login/            로그인 페이지
│   ├── onboarding/       3단계 온보딩 (예정)
│   ├── globals.css       Tailwind v4 설정 + 디자인 토큰
│   ├── layout.tsx
│   └── page.tsx          → /dashboard 로 redirect
├── components/
│   ├── dashboard/        대시보드 섹션 컴포넌트
│   ├── onboarding/       온보딩 단계 컴포넌트
│   └── ui/               shadcn/ui 컴포넌트
├── lib/
│   ├── supabase/         Supabase 클라이언트 헬퍼
│   ├── types.ts          공유 타입
│   └── utils.ts
└── proxy.ts              미들웨어 (Next.js 16 명칭)

supabase/
└── schema.sql            DB 스키마 + RLS + 초기 데이터
```

---

## 문서

- [`AGENTS.md`](./AGENTS.md) — **프로젝트 규칙·컨벤션·패턴 (바이브 코딩 SSOT)**
- [`CLAUDE.md`](./CLAUDE.md) — Claude Code 가 자동 로드 (AGENTS.md 참조)
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — 팀 협업 워크플로우
- [`supabase/schema.sql`](./supabase/schema.sql) — DB 스키마

---

## Phase 로드맵

| Phase | 기간 | 주요 내용 |
|---|---|---|
| **Phase 1** | 1-2개월 | 로그인 + 온보딩 + 기본 UI + 수동 업로드 + 컨텐츠 열람 |
| **Phase 2** | 2-3개월 | 자동 크롤링 + 중복 필터링 + 검색/필터 + AI 요약·번역 |
| **Phase 3** | 3-4개월 | AI 보고서 생성 + 뉴스레터 발송 + 어드민 고도화 |
| **Phase 4** | 이후 | 사용자 피드백 + 데이터 소스 확장 + 성능 최적화 |
