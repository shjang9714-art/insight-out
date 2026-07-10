# 지시서 281 — 토픽 커버 폴백 셀렉터 (public/topic-covers 폴더 방식)

> 작성: Opus(Cowork) · 레인: 콘텐츠 카드 커버 폴백(생성 이미지 풀 배선)
> 근거: David가 생성 커버 이미지(JPG 48장, 5.9MB)를 **`public/topic-covers/`** 에 넣음. 썸네일 없는 카드에 주제 매칭 커버를 폴백으로.
> **244 대체**: `docs/sonnet-지시서/244-*`(DB `topic_cover_images`+버킷+어드민 UI)는 미구현. David 결정=**레포 public 폴더 방식** → DB·버킷·수희·어드민 불필요. 본 지시서로 대체.
> 협업 루프: 로컬(커밋X). David 위임 → 구현 → Opus 검증 → "커밋". **SQL 없음. 신규 npm 없음.** 이미지는 이미 배치됨.
> 폴백 체인(설계 문서): 실제 썸네일 > (og:image 219) > **생성 풀(이번)** > BrandedCover.

---

## 0. 한 줄

`public/topic-covers/` 이미지들을 **빌드 시 매니페스트**로 색인하고, 카드에 실제 썸네일이 없을 때 콘텐츠의 **matched_groups → matched_keywords → category** 우선순위로 매칭되는 커버를 **id 해시로 고정 회전** 선택해 `thumbnailUrl`로 넘긴다(카드 컴포넌트 무수정). 매칭 없으면 기존 `BrandedCover`.

## 1. 현행 진단 (검증된 코드 사실)

- 이미지: `public/topic-covers/*.jpg` 48장. 파일명이 주제명(그룹/카테고리/엔티티) + 변형 접미(`-2`,`5` 등). 예: `AICC-2.jpg`, `통신 b2b.jpg`, `전략보고서 표지-3.jpg`, `반도체.jpg`, `도요타.jpg`.
- 카드: `ContentCard.tsx`·`ContentListCard.tsx` 모두 `thumbnailUrl` 없을 때 `BrandedCover`로 폴백. **matched_groups/entity는 카드에 안 넘어옴**(카드는 category·thumbnailUrl·keywords/tags만).
- 쿼리 층엔 있음: `FeedSlot.tsx` FALLBACK_SELECT / `src/app/api/feed/recommended/route.ts` / `src/app/dashboard/contents/page.tsx` 쿼리 모두 `matched_groups, matched_keywords, category, thumbnail_url` select. **entity 관계는 미조회.**
- `contents.matched_groups text[]` = `keyword_groups.name`(한글 라벨) 저장. 정규 그룹명(51 시드 + 사이버보안): 경쟁사·빅테크·**AI 기술**·**AICC**·**AIDC**·**통신 B2B**·**모빌리티**·**CCTV·영상보안**·**SME 솔루션**·**피지컬 AI**·**정부 규제**·정부 사업·**제조 DX**·**IT 동향**·**에너지**·**ESG**·사이버보안.
- 카테고리(contents.category DB값): 뉴스·리포트·웹인사이트·유튜브·AI보고서(+deprecated). 카드 `category` prop = raw DB값.
- public 스캔 유틸/매니페스트 없음(신규).

## 2. 구현

### 2-A. 매니페스트 생성 (빌드 시)
- 스크립트 `scripts/build-topic-cover-manifest.mjs`(Node): `public/topic-covers/` 를 readdir → 이미지 파일(jpg/jpeg/png/webp)만 → **정규화 키별로 그룹핑** → `src/lib/contents/topic-cover-manifest.generated.ts` 로 출력(커밋 대상 + 빌드 재생성).
  - 파일명 → rawKey: 확장자 제거 + 뒤쪽 변형 접미 제거(`-?\d+$` 및 뒤 숫자, 예 `모빌리티5`→`모빌리티`, `AICC-2`→`AICC`, `전략보고서 표지-3`→`전략보고서 표지`).
  - rawKey → canonicalKey: **ALIAS 맵**(2-B) 적용(없으면 rawKey 그대로).
  - 값: URL 경로 `/topic-covers/<원본파일명>`(공백·쉼표는 `encodeURI`). 같은 canonicalKey 아래 배열.
  - 결과 타입: `export const TOPIC_COVER_POOL: Record<string, string[]>`.
- `package.json`에 `"prebuild": "node scripts/build-topic-cover-manifest.mjs"`(+ 원하면 `predev`) 추가 → 빌드/배포 시 항상 최신. (초기 1회는 로컬 실행해 generated 파일 커밋.)

### 2-B. 셀렉터 헬퍼 — `src/lib/contents/topic-cover.ts`(신규)
- `ALIAS: Record<string,string>`(파일 rawKey → 매칭 대상 canonical):
  - `AI기술`→`AI 기술`, `통신 b2b`→`통신 B2B`, `피지컬ai`→`피지컬 AI`, `제조dx`→`제조 DX`, `정부규제`→`정부 규제`, `cctv`→`CCTV·영상보안`, `sme`/`sme,soho`→`SME 솔루션`, `IT`→`IT 동향`, `ai보고서`→`AI보고서`, `전략보고서 표지`→`전략보고서`, `esg`→`ESG`. (그 외 AICC·AIDC·모빌리티·에너지·뉴스·웹인사이트·리포트·반도체·클라우드·도요타·현대자동차 등은 그대로.)
- `normalize(s)`: trim + 소문자 + 내부 공백/구두점 완화 비교용(양쪽에 적용해 매칭 견고화).
- `pickTopicCover({ id, matchedGroups, matchedKeywords, category }): string | null`:
  1. 후보 키 순서 = `[...matchedGroups]` → `[...matchedKeywords]` → `[category]`(우선순위: 그룹>키워드(반도체/클라우드/도요타/현대자동차 커버)>카테고리).
  2. 각 후보를 normalize해 `TOPIC_COVER_POOL`의 normalize된 키와 매칭. 첫 매칭 키의 배열에서 **`hashIndex(id, arr.length)`**(안정 해시, 같은 콘텐츠=같은 이미지)로 1장 선택 → URL 반환.
  3. 매칭 없으면 `null`.
- `coverUrlFor(row)`: `row.thumbnail_url ?? pickTopicCover(row) ?? null` — 렌더 사이트에서 이 결과를 카드 `thumbnailUrl`로.

### 2-C. 렌더 사이트 배선 (카드 무수정)
- ContentCard/ContentListCard **렌더하는 모든 곳**에서, 카드에 넘기는 `thumbnailUrl` 을 `coverUrlFor({ id, thumbnail_url, matched_groups, matched_keywords, category })` 결과로 교체. 최소 대상(grep으로 전수 확인):
  - `src/app/dashboard/contents/page.tsx`(리스트, `thumbnailUrl={item.thumbnail_url}` → `coverUrlFor(item)`).
  - `src/components/feed/RecommendedFeed.tsx`(현재 `thumbnailUrl={null}` 하드코딩 → `coverUrlFor(item)`; item에 matched_groups/keywords/category 있음).
  - 그 외 ContentCard/ContentListCard 사용처(홈 위젯·카테고리/엔티티 페이지 등) 전부 동일 적용. **각 사이트 쿼리 select에 matched_groups·matched_keywords·category·thumbnail_url 포함 확인**(없으면 추가; 대부분 이미 있음).
- 엔티티 기반 매칭(content_entities)은 이번 범위 밖(도요타/현대자동차는 matched_keywords로 커버되면 사용, 아니면 미사용) — 후속.

## 3. 회귀 가드 / 비기능 요건
- **SQL·신규 npm 0.** 이미지는 정적(`/topic-covers/…`) 서빙. 매니페스트는 빌드 생성 TS(런타임 fs 접근 없음 → Vercel 안전).
- 카드 컴포넌트 무수정(표시 로직 유지). 실제 썸네일 있으면 그대로 우선. 매칭 없으면 BrandedCover(회귀 0).
- 파일명 공백/쉼표 `encodeURI`로 안전. 대소문자/공백 normalize 비교.
- 결정적 회전(id 해시) → 같은 콘텐츠는 항상 같은 커버(깜빡임·불일치 없음).
- 이미지 git 포함(5.9MB) 허용. 대량 확장 시 webp/버킷 재검토(후속).

## 4. 검증 (Sonnet 자체)
1. `node scripts/build-topic-cover-manifest.mjs` 실행 → generated.ts 생성, 48장이 키별로 묶임(예: `AICC`3·`모빌리티`5·`정부 규제`4·`전략보고서`5). `npx tsc --noEmit` 0 / `npx eslint` 0 / build(prebuild 훅 포함) 성공.
2. 썸네일 없는 콘텐츠 카드에 matched_groups/keyword/category에 맞는 커버가 뜸(예: 반도체 기사→반도체.jpg, AICC 그룹→AICC*.jpg, 뉴스 폴백→뉴스*.jpg). 같은 글 새로고침 시 동일 이미지.
3. 매칭 없는 콘텐츠 → 기존 BrandedCover. 실제 썸네일 있는 카드 → 그대로.
4. 피드·콘텐츠 리스트·홈 위젯 등 카드 사용처 전부 반영(하드코딩 null 잔존 없음). 라이트·다크 스크린샷.
5. 공백/쉼표 파일명(`통신 b2b.jpg`)도 정상 로드(404 없음).

## 5. 라이브 검증 체크리스트
- [ ] 이미지 없는 카드에 주제에 맞는 커버가 붙는다(반도체·모빌리티·AICC·정부규제 등)
- [ ] 같은 콘텐츠는 항상 같은 커버가 나온다
- [ ] 매칭 안 되는 콘텐츠는 기존 브랜드 커버로 자연스럽게 폴백된다
- [ ] 피드·리스트·홈 등 카드가 나오는 곳 모두 반영된다
- [ ] 이미지 추가/교체 후 재배포하면 매니페스트가 자동 갱신된다

## 6. 후속
- 엔티티(content_entities) 기반 매칭(도요타/현대자동차 등 회사 커버 정확화) — 배치 조회 추가.
- 이미지 대량화 시 webp 변환·Supabase 버킷(244) 전환·어드민 업로드 UI.
- ③ 크롤 시점 og:image 자동 수집과의 폴백 순서 정리.
