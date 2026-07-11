# 지시서 275 — 전략보고서 재설계 (2/3) 서비스 UI: 카드형 리스트 + HTML 상세

> 설계: `docs/설계-전략보고서-리서치카드형-정기발행.md`. 274(백엔드·발행모델) 후속. **발행된(published_at not null) 보고서**를 리서치 콘텐츠 카드처럼 노출하고, 상세는 `body_html`을 sanitize 렌더.

전제: 274 배포(`getPublishedReports`/`getReport`, body_html·summary·cover_image_url·publisher·published_at). SQL 274 적용 전이면 graceful(빈 목록/기존 폴백).

대상: `src/app/dashboard/reports/page.tsx`(리스트), `src/app/dashboard/reports/[id]/page.tsx`(상세), 카드 컴포넌트 신규, sanitize 유틸.

---

## 1. 리스트 (`dashboard/reports/page.tsx`) — 카드 그리드
- 데이터: `getPublishedReports()`(274) — **발행분만**. 미발행/초안은 서비스에서 숨김.
- **카드**(리서치/콘텐츠 카드 톤 재사용): 상단 `cover_image_url` 이미지(없으면 추상/그라디언트 폴백 or type색 플레이스홀더) → 제목 → `summary`(2~3줄 클램프) → 하단 메타: `published_at`(YYYY.MM.DD) + `publisher`(발행자) + `type` 배지.
- 그리드 반응형(모바일 1열 / 데스크톱 2~3열). 카드 클릭 → 상세.
- 기존 텍스트 리스트/상태(초안·생성중) 노출은 서비스에서 제거(어드민 276으로 이동).
- 빈 상태: "발행된 전략보고서가 아직 없습니다."

## 2. 상세 (`dashboard/reports/[id]/page.tsx`) — HTML 렌더
- `getReport(id)`. **미발행 보고서는 서비스에서 404/접근 차단**(어드민 미리보기는 276에서 별도).
- 헤더: 제목, published_at, publisher, type 배지, (있으면) cover 이미지.
- 본문: `body_html` 있으면 **sanitize 후** `dangerouslySetInnerHTML`로 `prose` 컨테이너에 렌더. 없으면 `body_md` → 기존 `ReportMarkdown` 폴백.

## 3. Sanitize 유틸 (`src/lib/reports/sanitize-html.ts` 신규)
- 서버측 살균: **`sanitize-html`** 사용(`npm i sanitize-html`). 허용 태그 화이트리스트: `h2 h3 h4 p ul ol li strong em b i br hr blockquote table thead tbody tr th td a span`. 허용 속성 최소(`a[href]` — http/https만, `target=_blank`+`rel=noopener`). `script iframe style on*` 전면 차단.
- 274에서 이미 1차 제거하지만, **렌더 시 2차 sanitize 필수**(방어적).

## 4. 카드 컴포넌트 (`src/components/reports/ReportCard.tsx` 신규)
- props: `{ id, title, summary, coverImageUrl, publisher, publishedAt, type }`.
- 콘텐츠 카드와 시각 일관(라운드·보더·호버). cover 없을 때 폴백 처리.

## 5. 회귀 가드
- SQL 274 전(42703): `getPublishedReports` 빈 목록 graceful, 상세는 body_md 폴백.
- 비유저(미로그인)·미발행 접근 차단.
- 기존 `ReportMarkdown` 폴백 유지(구 markdown 보고서 호환).
- sanitize로 스크립트 실행 불가 확인.

## 6. 검증 (Sonnet)
- `npx tsc --noEmit` 0 / `npx eslint` 0 / `npm run build`.
- 발행 보고서: 카드(이미지·제목·요약·날짜·발행자) → 상세 HTML 렌더(sanitize).
- 미발행: 리스트/상세 비노출.
- `<script>` 포함 HTML 주입 시 제거 확인.
- 커밋: `feat: 전략보고서 서비스 카드형 UI + HTML 상세 (지시서 275)`.

SQL 없음(274 전제). 이 지시서는 서비스 카드 리스트 + HTML 상세.
