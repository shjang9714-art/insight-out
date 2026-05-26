# 협업 가이드

Insight Out 팀의 일하는 방식. 새로 합류한 사람은 이 문서만 보고도 PR 을 만들 수 있어야 합니다.

> 작성 전 [`AGENTS.md`](./AGENTS.md) 를 반드시 먼저 읽으세요. 프로젝트 규칙은 거기에 있습니다.

---

## 권한 구조

- **A (owner)**: GitHub repo · Vercel · Supabase 소유. 환경변수/DB/배포 운영 담당
- **B (collaborator)**: GitHub 협업자. 코드 작성·리뷰·PR 담당

**B 가 직접 할 수 없는 것** (필요 시 A 에게 요청):
- Vercel 환경변수 추가/수정
- Supabase 스키마 적용 (DDL 실행)
- 운영 배포 롤백

---

## 브랜치 전략

`main` 한 줄짜리 (단순 GitHub Flow). 운영 배포는 항상 `main` 기준.

| 브랜치 | 용도 |
|---|---|
| `main` | 운영 (Vercel Production 자동 배포) |
| `feat/*` | 새 기능 |
| `fix/*` | 버그 수정 |
| `chore/*` | 빌드/설정/문서 등 |
| `docs/*` | 문서만 변경 |

### 브랜치 이름 예시
```
feat/google-oauth-login
feat/대시보드-키워드-버블
fix/온보딩-2단계-validation
chore/eslint-config-tweak
docs/readme-셋업-단계-수정
```

---

## 일상 작업 플로우

### 새 작업 시작
```bash
git checkout main
git pull
git checkout -b feat/짧은-설명
```

### 커밋 메시지
형식: `<type>: <한국어 요약>`

```
feat: Google OAuth 로그인 페이지 구현
fix: 온보딩 2단계 빈 값 검증 누락 수정
chore: tailwind v4 설정 정리
docs: README 셋업 단계 보완
```

`type` 종류: `feat`, `fix`, `chore`, `docs`, `refactor`, `style`, `test`, `perf`.

### Push & PR
```bash
git push -u origin feat/짧은-설명
```

GitHub 에서 PR 생성 → 템플릿 따라 작성 → 상대방에게 리뷰 요청.

### 리뷰
- 24시간 안에 1차 코멘트
- Approve 받으면 본인이 merge (squash merge 권장)
- merge 후 로컬에서 브랜치 삭제: `git branch -d feat/짧은-설명`

---

## PR 작성 시 체크리스트

[`AGENTS.md` 16번 섹션](./AGENTS.md#16-pr-체크리스트-제출-전-본인-확인) 참고.

추가로:
- [ ] 제목은 커밋 메시지 형식과 동일 (`feat: ...`)
- [ ] PR 설명에 "무엇을, 왜" 작성
- [ ] UI 변경 시 스크린샷 첨부
- [ ] DB 스키마 변경 시 `supabase/schema.sql` 도 함께 수정
- [ ] 환경변수 추가 시 `.env.example` 도 함께 수정
- [ ] Preview URL (Vercel 봇이 댓글로 달아줌) 에서 동작 확인

---

## 환경변수 변경 시

```
1. 코드에서 process.env.NEW_KEY 사용
2. .env.example 에 NEW_KEY= (빈 값) 추가  ← PR 에 포함
3. 본인 .env.local 에 NEW_KEY=실제값 추가
4. PR 머지 시 A 에게 알림 → A 가 Vercel 대시보드에서 운영 환경변수 추가
```

순서를 어기면 운영 배포가 깨집니다.

---

## DB 스키마 변경 시

```
1. supabase/schema.sql 에 변경 내용 추가
   - 새 테이블/컬럼/인덱스/RLS 정책
   - 가능하면 idempotent 하게 (`if not exists` 등 활용)
2. PR 설명에 "이 PR 머지 후 A 가 SQL 실행 필요" 명시
3. A 가 PR 머지 후 Supabase Dashboard 에서 해당 부분만 실행
4. 운영 적용 확인 후 PR 클로즈
```

---

## 비밀 정보 다루기

**절대 commit 하지 말 것**:
- `.env.local`
- API 키, 비밀번호, 토큰
- Supabase service role key
- 실제 사용자 데이터 (개인정보 포함)

실수로 commit 했다면:
1. 즉시 해당 키 폐기 + 재발급 (Supabase/Google 대시보드에서)
2. A 에게 알려 Vercel 환경변수도 갱신
3. git history 에서 지우려 시도하지 말기 (이미 노출됨 — 키 교체가 답)

---

## 코드 리뷰 원칙

리뷰할 때:
- 작동하는지보다 **읽기 좋은지** 를 본다
- 컨벤션(`AGENTS.md`) 위반은 짚되, 취향 차이는 의견으로만
- "이거 왜 이렇게 하셨어요?" 식의 질문형 코멘트 환영

리뷰받을 때:
- 방어적 반응 X. 의도를 설명하고 더 나은 안이 있으면 채택
- 변경 요청 받으면 같은 PR 에서 commit 추가 (force push 지양)

---

## 빠른 참조

| 상황 | 어떻게 | 누구 |
|---|---|---|
| 새 기능 코딩 | branch + PR | 누구나 |
| 새 환경변수 | `.env.example` 수정 + Vercel 등록 요청 | 코드는 누구나, Vercel 은 A |
| 새 DB 테이블 | `supabase/schema.sql` 수정 + 적용 요청 | 코드는 누구나, 실행은 A |
| 빌드 실패 | Vercel Preview 로그 확인 → 안 보이면 A 에게 요청 | A |
| 운영 롤백 | Vercel Dashboard → Deployments → 이전 버전 promote | A |
| Supabase 데이터 조회 | Supabase Studio | A (B 도 멤버 초대돼 있으면 가능) |

---

## 도움이 필요할 때

- 코드 토론 → GitHub PR 댓글 / Issue
- 즉시 답이 필요한 질문 → 카톡/Slack
- 운영/스키마 결정 → Notion 페이지에 결정 사항 남기기
