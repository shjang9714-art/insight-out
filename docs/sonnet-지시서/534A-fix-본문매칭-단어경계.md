# 지시서 534-A-fix — 수동 추출 경로의 본문 매칭에 단어경계 적용

> 플래너(Opus) · 2026-08-21 · 브랜치 `agent/534a-fix-word-boundary` (534-A 머지 직후의 origin/main 기준)
> **534-A 지시서의 누락이다.** 구현 문제가 아니다.

## 문제

`src/app/api/admin/contents/[id]/extract/route.ts` 는 엔티티 맵의 각 키를
**본문 전체에 substring 매칭**한다.

```ts
const searchText = `${title} ${koBody}`.toLowerCase()
[...aliasMap.entries()].filter(([alias]) => searchText.includes(alias))
```

534-A 이전에는 맵이 별칭 6개(전부 길고 특징적)뿐이라 안전했다.
지금은 canonical_name 114개가 들어가고 그중 **27개가 2~3자**다.

```
2자: AI, AX, DT, DX, KT, 로봇, 조달
3자: AWS, B2B, ESG, IDC, LLM, M2M, MEC, MES, POS, PPA, RAG, REC, SKT, V2X, VMS, VPP, 상담봇, 음성봇, 전파법, 플랫폼
```

소문자 `"ai"` 는 said·detail·chain·email 안에서, `"rec"` 는 record·recent 안에서 걸린다.
여기서 만든 `content_entities` 행은 관계지도·경쟁사 판정·키워드 상세로 흘러간다.

⚠️ **크롤러 경로는 무관하다** — 거기는 `aliasMap.get(kw)` 토큰 완전일치다. 이 라우트만 고친다.

## 작업

`quality.ts:15` 의 **`patternHit(textLower, pattern)`** 을 그대로 쓴다.
1~4자 영숫자에만 단어경계를 걸고 나머지는 `includes` 로 떨어지는, 529 에서 `AD` 오탐을
잡을 때 쓴 바로 그 로직이다. **새로 만들지 말 것.**

```ts
import { patternHit } from '@/lib/crawler/quality'
// ...
.filter(([alias]) => patternHit(searchText, alias))
```

## 하지 않을 것

- `patternHit` 수정 — 다른 곳(키워드그룹 매칭·광고 필터)이 같이 쓴다
- 크롤러 링킹 경로 변경
- 한글 짧은 이름(로봇·조달)에 별도 규칙 추가 — `patternHit` 이 영숫자만 경계를 거는 건
  한글에 단어경계 개념이 없어서다. 지금 건드리면 키워드그룹 매칭까지 흔들린다

## 검증

1. `npx tsc --noEmit` / `npx eslint`(경고 0건) / `npm run build`
2. 영문이 섞인 본문(예: "detail", "record", "email" 이 들어간 기사)에 수동 추출을 돌렸을 때
   **AI·REC 같은 엔티티가 붙지 않는지**
3. 진짜로 "AI" 를 독립 토큰으로 언급한 기사에는 **여전히 붙는지**
4. 한글 이름(로봇·플랫폼)은 종전대로 부분일치로 붙는지
