# 지시서 222 — 유튜브 카드를 뉴스 카드(ContentCard)로 통일

목표: 유튜브 콘텐츠를 뉴스와 동일한 `ContentCard`로 렌더한다 — **썸네일 인카드(16:9) + 제목 상단 + 해시태그**. 클릭 시 유튜브 원본으로 이동(재생) 동작은 유지.

범위(David): `ContentCard` 재사용으로 통일(별도 `YoutubeVideoCard` 대체).

---

## 1. 현행 진단 (검증된 코드 사실)

- **ContentCard** `src/components/dashboard/ContentCard.tsx`: props `{id,title,summaryKo,category,sourceName,publishedAt,thumbnailUrl,href?,keywords?}`. 16:9 썸네일(없으면 BrandedCover) + 카테고리칩 + 출처 + **해시태그 `#{kw}`(100–109)** + 제목(line-clamp-2) + 요약 + timeAgo. **79행: `resolvedHref = href ?? (category !== '유튜브' ? '/dashboard/contents/{id}' : null)` → 유튜브는 href null → 클릭 불가(`<div>`)**.
- **YoutubeVideoCard** `src/components/dashboard/YoutubeVideoCard.tsx`: props `{title,originalUrl,sourceName,publishedAt}`. `extractVideoId(originalUrl)`로 `hqdefault.jpg` 썸네일 생성, `<a href=watchUrl target=_blank>` 외부 이동, hover 재생 오버레이. **해시태그 없음**.
- **사용처**:
  - `src/app/dashboard/contents/page.tsx`(유튜브 카테고리 그리드, ~666·724): `contents` 테이블(category 유튜브)에서 `matched_keywords, thumbnail_url, original_url, sources(name)` 등 조회 후 `YoutubeVideoCard`로 렌더. → **여기 contents 행엔 해시태그(matched_keywords)·thumbnail_url 있음.**
  - `src/components/dashboard/YoutubeSection.tsx`(홈 위젯): **별도 `youtube_videos` 테이블**(`video_id, title, channel_name, thumbnail_url, published_at`)에서 조회 → `YoutubeVideoCard`. **키워드 없음.**
- 데이터: `contents`(category='유튜브')엔 `matched_keywords`·`thumbnail_url`·`original_url` 존재. `youtube_videos`엔 keywords 없음.

---

## 2. 구현

### 2-1. ContentCard — 외부링크·유튜브 재생 지원
- props에 `externalHref?: string | null`(새 탭 외부 이동용) 추가.
- `resolvedHref` 로직 수정:
  ```ts
  const isExternal = Boolean(externalHref)
  const resolvedHref = externalHref ?? href ?? `/dashboard/contents/${id}`
  ```
  (유튜브도 이제 `externalHref`로 클릭 가능.)
- 링크 렌더: `isExternal`이면 `<a href={resolvedHref} target="_blank" rel="noopener noreferrer">`, 아니면 기존 `<Link>`.
- 유튜브 재생 어포던스: `category==='유튜브'`일 때 썸네일 위 **재생 아이콘 오버레이**(YoutubeVideoCard의 오버레이 재사용/이식). 해시태그·제목·요약 구조는 뉴스와 동일.
- 썸네일 폴백 보강: 유튜브인데 `thumbnailUrl`이 없으면 `original_url`에서 video_id 추출해 `https://i.ytimg.com/vi/{id}/hqdefault.jpg` 사용(그것도 없으면 BrandedCover). `extractVideoId`는 YoutubeVideoCard에서 공유 유틸(`src/lib/youtube.ts` 신설)로 분리해 재사용.

### 2-2. contents/page.tsx 유튜브 그리드 → ContentCard
`category==='유튜브'` 분기의 `YoutubeVideoCard`를 `ContentCard`로 교체:
```tsx
<ContentCard
  id={item.id}
  title={item.title}
  summaryKo={item.summary_ko ?? null}
  category="유튜브"
  sourceName={item.sources?.name ?? item.author ?? null}
  publishedAt={displayDate(item, sortByCollected)}
  thumbnailUrl={item.thumbnail_url ?? null}
  externalHref={item.original_url}
  keywords={item.matched_keywords ?? []}
/>
```
그리드 클래스는 뉴스와 동일 규격으로 통일.

### 2-3. YoutubeSection(홈 위젯) → contents 소스로 통일
- 데이터 소스를 `youtube_videos` → `contents`(category='유튜브', status='published')로 변경(해시태그·thumbnail_url 확보), `select('id,title,summary_ko,original_url,thumbnail_url,matched_keywords,published_at,sources(name)').order('published_at',desc).limit(6)`.
- 렌더를 `ContentCard`로 교체(위와 동일 props).
- (youtube_videos 테이블 자체는 수집 파이프라인용으로 유지 — 표시만 contents 기준으로 통일.)

### 2-4. 정리
- `YoutubeVideoCard.tsx`는 사용처 0이 되면 삭제(또는 deprecated 주석). `extractVideoId`는 `src/lib/youtube.ts`로 이동해 ContentCard가 사용.

---

## 3. 회귀 가드
- 뉴스/리포트 등 기존 ContentCard 렌더 **불변**(외부링크 분기는 `externalHref`/유튜브에만).
- 유튜브 카드 클릭 → 유튜브 원본 새 탭(기존 동작 유지), 재생 오버레이 표시.
- 유튜브 해시태그(matched_keywords) 노출 — 뉴스와 동일.
- 썸네일 없을 때 video_id 유래 썸네일 → 없으면 BrandedCover(211) 폴백.
- 홈 위젯 유튜브 6건 정상(빈 상태 안내 포함).
- `youtube_videos` 파이프라인 무변경.

## 4. 검증
- `npx tsc --noEmit` 0, `npx eslint` 0, `npm run build`.
- 유튜브 페이지·홈 위젯 양쪽 렌더 확인.

## 5. 라이브 체크리스트
- [ ] 유튜브 탭(`?category=유튜브`) 카드가 뉴스처럼 썸네일·제목 상단·해시태그로 표시.
- [ ] 카드 클릭 → 유튜브 원본 새 탭, 재생 아이콘 오버레이.
- [ ] 홈 "유튜브 영상" 위젯도 동일 카드로 표시.
- [ ] 썸네일 없는 영상은 video_id 유래/기본 표지 폴백.
- [ ] 뉴스/리포트 카드 회귀 없음.

SQL 없음.
