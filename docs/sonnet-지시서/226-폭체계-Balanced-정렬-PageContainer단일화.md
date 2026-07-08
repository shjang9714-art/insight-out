# 지시서 226 — 폭 체계 Balanced 정렬(1152/768) + PageContainer 단일화

목표: 레벨1(전역) 폭을 1280→**1152**로 조이고, 레벨2 폭을 **화면 성격**(목록/혼합=1152, 순수 리딩·폼=768)으로 통일한다. 각 페이지가 제각각 하드코딩한 폭을 `PageContainer` variant로 **단일 소스화**해 드리프트를 없앤다.

범위(David): 폭 체계만. 톤/색 변경 없음(최소 터치). SQL 없음.

결정 확정: **L1=1152**, 넓음(list)=1152 · 좁음(narrow)=768 **두 폭만**. 혼합형(이슈·엔티티 상세)=1152.

---

## 1. 현행 진단 (검증된 코드 사실)

- 전역 셸: `src/app/dashboard/layout.tsx:22` `<main className="mx-auto w-full max-w-screen-xl print:max-w-none">` → **1280(screen-xl)**.
- `src/components/PageContainer.tsx`: `list`(= `px-4 py-6 sm:px-5`, 레벨1 폭 상속) / `reading`(= `mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8`, **768**).
- **목록형(PageContainer list 사용)**: 홈·콘텐츠 목록·이슈 목록·기업동향·리포트 목록 → 레벨1 상속(자동 반영).
- **하드코딩(각 페이지가 직접 `mx-auto max-w-*`)**:
  - `contents/[id]/page.tsx:213` `max-w-3xl`(768) — 순수 리딩
  - `reports/[id]/page.tsx:113` `max-w-3xl` + `print:*` — 순수 리딩
  - `issues/[id]/page.tsx:378` `max-w-3xl`(768) — **혼합(타임라인+관련)**
  - `entities/[id]/page.tsx:362` `max-w-3xl`(768) — **혼합(관계지도+시그널)**
  - `topics/[topic]/page.tsx:116` `max-w-3xl`(768) — **목록(기사 62건인데 좁아 보이던 화면)**
  - `briefings/page.tsx:38` `max-w-5xl`(1024) — 목록(아웃라이어)
  - `mypage/page.tsx:464` `max-w-2xl`(672) — 폼
  - `reports/new/page.tsx:131` `max-w-2xl`(672) — 폼
- 헤더 `DashboardHeader.tsx`: sticky 바가 전역 폭과 별개일 수 있음 → 내부 콘텐츠가 1152와 정렬되는지 확인 필요(정렬 안 되면 내비가 콘텐츠보다 넓게 퍼져 어긋남).

---

## 2. 구현

### 2-1. 레벨1 폭 1152
`layout.tsx:22`: `max-w-screen-xl` → `max-w-6xl`(1152). `print:max-w-none` 유지.

### 2-2. PageContainer variant 정리(단일 소스)
- `list`: 그대로(레벨1 1152 상속).
- `reading`: **768 유지**(순수 리딩·폼 공용). 라벨 유지(또는 `narrow` 별칭 추가는 선택).
- 변경 없음(값은 이미 목표와 일치). 요지는 **하드코딩 페이지를 이걸로 교체**하는 것.

### 2-3. 하드코딩 페이지 → PageContainer 교체(성격별 버킷)
각 페이지의 `<div className="mx-auto max-w-* ...">` 래퍼를 아래로 교체(내부 컨텐츠·간격 유지, 필요한 클래스는 `className`으로 전달):

| 페이지 | 현재 | → 버킷 | 결과 폭 |
| --- | --- | --- | --- |
| `topics/[topic]` | max-w-3xl | **list** | 1152 (넓어짐, 휑함 해소) |
| `briefings` | max-w-5xl | **list** | 1152 |
| `issues/[id]` | max-w-3xl | **list** | 1152 (혼합) |
| `entities/[id]` | max-w-3xl | **list** | 1152 (혼합) |
| `contents/[id]` | max-w-3xl | **reading** | 768 (유지) |
| `reports/[id]` | max-w-3xl | **reading** | 768 (print 클래스 유지) |
| `mypage` | max-w-2xl | **reading** | 768 (672→768) |
| `reports/new` | max-w-2xl | **reading** | 768 (672→768) |

- `reports/[id]`는 `print:px-0 print:py-0 print:max-w-none`가 있으므로 `PageContainer variant="reading" className="print:px-0 print:py-0 print:max-w-none"` 형태로 전달(또는 PageContainer가 print에 안전하면 그대로).

### 2-4. 헤더 폭 정렬
`DashboardHeader`의 내부 콘텐츠(로고+내비+우측 액션)를 감싸는 컨테이너를 **`mx-auto w-full max-w-6xl px-4 sm:px-5`** 로 맞춰 내비가 본문 1152와 좌우 정렬되게 한다(현재 전역 폭과 어긋나면 정렬). sticky 바 배경은 풀폭 유지, 내용만 1152 정렬.

### 2-5. 넓은 페이지 내 긴 본문 제한(가독)
혼합형(이슈·엔티티 상세)에서 **긴 설명·요약 문단 블록**은 안쪽을 `max-w-3xl`(768)로 감싸 한국어 줄길이(~40자)를 지킨다. 그래프·리스트·카드그리드는 1152 그대로. (해당 블록이 있을 때만, 없으면 스킵.)

---

## 3. 회귀 가드
- 목록형(홈 등)은 레벨1 상속이라 1152 자동 반영, 레이아웃 깨짐 없음.
- 리딩(콘텐츠·리포트 상세)은 768 유지(폭 변화 없음), print 정상.
- 혼합형이 넓어진 뒤 그래프/리스트가 정상 배치되는지(관계지도 오버플로우 없나).
- 폼(마이페이지·작성) 672→768: 입력 필드가 지나치게 늘어지지 않는지(대체로 필드에 자체 폭/그리드 있음).
- 헤더 내비가 본문과 좌우 정렬되는지(어긋남 제거).
- 반응형(모바일/태블릿)에서 px 패딩 유지, 가로 스크롤 없음.
- 다크/라이트 무관(폭만).

## 4. 검증
- `npx tsc --noEmit` 0, `npx eslint`(수정 파일) 0, `npm run build`.
- 주요 폭 렌더 육안: 홈/토픽/브리핑/이슈상세/엔티티상세=1152, 콘텐츠상세/리포트상세/마이페이지=768.

## 5. 라이브 체크리스트
- [ ] 홈·목록이 1152로 살짝 조여져 밀도↑, 내비가 본문과 정렬.
- [ ] 토픽 기사목록(62건)이 1152로 넓어져 휑함 해소.
- [ ] 브리핑 1024→1152 통일.
- [ ] 이슈/엔티티 상세 1152(그래프·리스트 여유), 긴 본문 블록은 768로 좁게.
- [ ] 콘텐츠/리포트 상세 768 유지, 인쇄 정상.
- [ ] 마이페이지·작성 768.

SQL 없음. 톤/색 변경 없음(폭·컨테이너만).
