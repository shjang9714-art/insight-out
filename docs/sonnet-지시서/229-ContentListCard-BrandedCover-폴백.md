# 지시서 229 — ContentListCard 커버 폴백(BrandedCover) 추가

목표: 콘텐츠 목록 카드 뷰(뉴스·리서치 등)에서 **썸네일이 없어도 카드에 커버가 보이도록** `ContentListCard`에 BrandedCover 폴백을 추가한다. 리서치(리포트) 카드가 텍스트만 나오던 문제 해결.

범위(David): ContentListCard만 수정. SQL 없음. 아주 작음.

---

## 1. 현행 진단 (검증된 코드 사실)
- 콘텐츠 카드 뷰(유튜브 제외)는 `contents/page.tsx:670`에서 **`ContentListCard`**로 렌더.
- `ContentListCard.tsx:63–71`: 커버를 **`{thumbnailUrl && (<div class="aspect-[16/9]"><img/></div>)}`** — 즉 **thumbnailUrl 있을 때만** 표시, **BrandedCover 폴백 없음.**
- 211에서 만든 "표지 없으면 BrandedCover"는 **`ContentCard`에만** 적용됨(`ContentCard.tsx`의 `Thumbnail`). `BrandedCover`는 `src/components/dashboard/BrandedCover.tsx`(215에서 분리)로 재사용 가능.
- 리서치 리포트는 대부분 `thumbnail_url`이 비어 있어(크롤 대상 아님, PDF 자동표지·업로드분만 채워짐) 커버가 안 보임.
- `ContentListCard` props: `title`, `category`(ContentCategory), `sourceName`, `thumbnailUrl` 보유 → BrandedCover 렌더에 필요한 값 이미 있음.

## 2. 구현 (ContentListCard.tsx만)
- import: `import BrandedCover from '@/components/dashboard/BrandedCover'`.
- 커버 블록(63–71)을 **항상 16:9 슬롯 렌더**로 교체(ContentCard의 Thumbnail 미러):
  ```tsx
  <div className="aspect-[16/9] overflow-hidden rounded-t-2xl bg-muted">
    {thumbnailUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={thumbnailUrl} alt={title} loading="lazy"
           className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
    ) : (
      <BrandedCover category={category} title={title} sourceName={sourceName ?? null} />
    )}
  </div>
  ```
- 카드 컨테이너에 `group`·`overflow-hidden`·`rounded-2xl`이 이미 있는지 확인(없으면 커버 상단 라운드·hover scale 위해 보강). 기존 텍스트 영역 레이아웃은 유지.

## 3. 회귀 가드
- 썸네일 있는 카드는 종전과 동일(이미지 표시).
- 썸네일 없는 카드(리서치 등)는 이제 BrandedCover(카테고리 그라디언트+제목+출처) 표시 → 텍스트만 나오지 않음.
- 목록(list)·행(row) 뷰는 무변경(ContentRow 등 별개).
- 라이트/다크 모두 BrandedCover 정상(카테고리 폴백색은 다크 대응 포함).
- 유튜브는 여전히 ContentCard(재생 오버레이 포함) 사용 — 무관.

## 4. 검증
- `npx tsc --noEmit` 0, `npx eslint`(ContentListCard.tsx) 0, `npm run build`.

## 5. 라이브 체크리스트
- [ ] 콘텐츠 > 리서치 카드에 커버(실제 or 브랜드 표지)가 항상 표시.
- [ ] 커버 있는 뉴스 카드는 그대로.
- [ ] 라이트/다크 정상.

SQL 없음.
