# 지시서 366 — 문서 상세 sticky 탭 해제 + 지식/외부 리포트 카드 톤 통일

> 대상: 구현 에이전트 · **신규 SQL 없음** · 357-A/B 후속 UI
> ⚠️ 읽을 것: `src/app/dashboard/contents/[id]/page.tsx`(L182 isReport·L252 sticky 서브탭·L470 PdfViewer) · `src/components/reports/ReportCard.tsx`(AI리포트 카드 톤 — 그라디언트 커버·유형 픽토그램·워드마크·칩·CTA) · `src/components/contents/ContentsBoard.tsx`(카드 렌더 분기) · `src/components/dashboard/ContentCard.tsx` · `AGENTS.md`

## 배경 (David, 스샷)
① 지식보고서 상세(PDF 뷰어)에 상단 리포트 서브탭이 `sticky`로 떠 따라와 PdfViewer를 가림. ② 지식보고서·외부 리포트 카드가 밋밋한 `ContentCard`(회색)라 AI 리포트 카드(`ReportCard`)와 톤이 안 맞음.

## 작업
### 1. 문서(PDF/PPTX) 상세에서 sticky 서브탭 정리
- `contents/[id]` L252의 `sticky top-14` 상단 탭 컨테이너가 **`isReport`(문서·PDF/PPTX)일 때는 PdfViewer를 가리지 않게** 한다. **문서 상세에선 서브탭을 sticky 해제(정적)** 로 두거나 제거 — 뒤로가기(`fallbackHref`, 이미 있음)로 목록 복귀. (일반 콘텐츠 상세의 sticky는 유지.)
- PdfViewer가 상단 바에 가리지 않도록 상단 offset/z-index 정리. 목표: **PDF 스크롤 시 탭이 문서 위에 떠 따라오지 않음.**

### 2. 지식/외부 리포트 카드 톤을 리포트형으로 통일
- `ReportCard`의 시각 언어(**그라디언트 커버 + 유형 픽토그램 워터마크 + 우상단 워드마크 + 유형·키워드 칩 + "리포트 열기" CTA**)를 **재사용 가능한 프레젠테이션 카드**로 추출(예: `ReportStyleCard`) — content/리포트 공용.
- `ContentsBoard`가 **`지식보고서`·`리서치(외부 리포트)` 카테고리일 때 이 리포트형 카드로** 렌더(기존 `ContentCard` 대신). 뉴스·유튜브·웹인사이트는 기존 `ContentCard` 유지.
- **워드마크·AiMark 구분(중요)**: AI 리포트 = "AI REPORT" + **AiMark**(AI 생성물). **지식보고서 = "지식보고서/KNOWLEDGE" 워드마크, AiMark 금지**(내부 업로드·비-AI). 외부 리포트 = "외부 리포트" 워드마크, AiMark 금지. 커버 그라디언트 톤은 통일하되 문구로 구분.
- 유형 픽토그램: 지식보고서/외부리포트는 doc 성격 아이콘(FileText 등), 표지 이미지 있으면 그걸 우선(pdf-cover).

## 회귀 / 주의
- **AiMark는 AI 산출물에만**(358 원칙) — 지식보고서·외부리포트 카드엔 부착 금지.
- 일반 콘텐츠(뉴스 등) 카드·상세 sticky는 회귀 없이 유지.
- 색 토큰(하드룰 9)·`prefetch={false}`.
- 검증: `tsc`·ESLint·`check-prefetch`·`build` + 육안(지식보고서 PDF 상세에서 탭 안 따라옴 / 지식·외부 리포트 카드가 AI리포트 톤 / AiMark는 AI리포트에만).

## 배포 게이트
⚠️ 브랜치 push+PR까지만, 브랜치명 회신 → Opus 검증 후 머지.
## 쪼개기
① 문서 상세 sticky 해제 / ② ReportStyleCard 추출 + 지식·외부리포트 적용. 2커밋.
