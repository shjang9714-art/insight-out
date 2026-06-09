# 지시서 26 — [#65] 아카이브 담기 팝업 UI 수정 (Radix Dialog 전환)

> 작성: Opus(Cowork) · 대상: 구현 에이전트(Claude Code) · 검증: Opus · 커밋: 구현 에이전트
> ⚠️ 작업 전 `AGENTS.md` + `src/components/archive/ArchiveButton.tsx` + `src/components/ui/`(기존 shadcn 래퍼 패턴: button/input/card) + `src/app/dashboard/contents/[id]/page.tsx`(ArchiveButton 사용처)를 읽을 것. `npm install` 먼저.
> 범위: **아카이브 담기 UI를 앵커 드롭다운 → 화면 중앙 Radix Dialog로 교체.** DB 스키마·RLS·API 변경 없음. `archives`/`archive_items` 쿼리 로직은 그대로 재사용.

---

## 배경 (현재 문제)

`ArchiveButton.tsx`는 트리거 버튼 아래에 **절대 위치 드롭다운**(`absolute right-0 top-11 w-60`)을 띄운다. 콘텐츠 상세 페이지 하단/모바일에서:
- 패널이 화면 **하단으로 넘쳐 노출**되고 **스크롤이 안 됨**(고정 높이 없음, 뷰포트 밖 잘림).
- 흐름이 **클릭 과다**: 열기 → "+ 새 아카이브 만들기" → 이름 입력 → 확인 → (다시) 담기.
- 외부 클릭 닫기를 수동 `mousedown` 리스너로 처리(중복·접근성 약함).

## 목표

화면 중앙 모달(Radix Dialog)로 바꿔 **항상 보이고, 내부 스크롤되고, 최소 클릭**으로 담기. ESC·오버레이 클릭으로 닫힘. 데스크톱·모바일 동일 동작.

---

## 1. shadcn 스타일 Dialog 래퍼 신규 — `src/components/ui/dialog.tsx`

- 의존성은 **이미 설치된 통합 패키지** `radix-ui`를 사용한다(별도 `@radix-ui/react-dialog` 설치 금지). import 형태:
  ```ts
  import { Dialog as DialogPrimitive } from 'radix-ui'
  ```
- 기존 `ui/` 컴포넌트 컨벤션(`cn` 유틸, `forwardRef`, data-slot/variant 스타일)과 동일한 톤으로 작성. 내보낼 것: `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogClose`.
- `DialogContent` 핵심 클래스(시맨틱 토큰 사용 — 지시서 29 다크모드와 정합):
  - 오버레이: `fixed inset-0 z-50 bg-black/50` + fade 애니메이션.
  - 콘텐츠: `fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-background p-5 shadow-xl` + **`max-h-[80vh] overflow-y-auto`**(스크롤 핵심) + `focus:outline-none`.
  - 우상단 닫기 버튼(`DialogPrimitive.Close`, lucide `X`).
- `cn` 유틸 경로는 기존 컴포넌트에서 쓰는 것과 동일하게(`@/lib/utils` 등 — 기존 ui 파일에서 확인 후 맞출 것).

## 2. `ArchiveButton.tsx` 리팩터

상태/쿼리(`archives`, `savedIds`, `handleAdd`, `handleCreate`, lazy load)는 **그대로 유지**. UI 레이어만 교체.

- 수동 `panelRef` + `mousedown` 외부클릭 useEffect **삭제** → Radix `Dialog`의 `open`/`onOpenChange`로 대체.
- 트리거: 기존 버튼을 `<DialogTrigger asChild>`로 감싼다(스타일·`isSaved` 분기 유지).
- 모달 본문 구성(클릭 최소화):
  1. `DialogHeader` — 제목 "아카이브에 담기".
  2. **아카이브 목록**: 각 행을 **한 번 클릭하면 즉시 담기**(현재도 1클릭이지만, 행 전체를 클릭 타깃으로 만들어 타깃 확대). 담긴 항목은 체크(`FolderCheck`)+`담김` 표시, 비활성. 낙관적 업데이트 유지.
  3. **신규 생성 폼을 항상 노출**(별도 "+ 만들기" 클릭 제거): 하단에 이름 `Input` + "만들고 담기" 버튼 상시 표시. Enter = `handleCreate`. 생성 성공 시 곧바로 `handleAdd`(기존 로직 그대로).
  4. `DialogFooter` — "완료"(`DialogClose`).
- 목록이 길어도 `DialogContent`의 `max-h-[80vh] overflow-y-auto`로 스크롤. 빈/로딩/에러 상태 문구는 기존 한국어 그대로 재사용.
- 색상은 하드코딩(`bg-white`,`text-gray-*`) 대신 **시맨틱 토큰**(`bg-background`,`bg-card`,`text-foreground`,`text-muted-foreground`,`border-border`) 사용 + 브랜드 강조 `brand-600`/`brand-50` 유지(지시서 29 정합).

## 3. 회귀 점검

- 상세 페이지(`/dashboard/contents/[id]`)에서 트리거 위치·`isSaved` 표시 동일.
- 담기/생성/중복("담겼음")/에러 동작 동일.
- 데스크톱 lg+ 레이아웃 회귀 없음(모달은 오버레이라 레이아웃 영향 없음).

---

## 완료 조건
- [ ] `src/components/ui/dialog.tsx` 신규(통합 `radix-ui` 사용, 중앙정렬·`max-h-[80vh] overflow-y-auto`·닫기버튼·ESC/오버레이 닫기)
- [ ] `ArchiveButton.tsx` 드롭다운/수동 외부클릭 제거 → Dialog로 교체, 쿼리·핸들러 로직 불변
- [ ] 생성 폼 상시 노출(Enter 생성+담기), 행 1클릭 담기, 시맨틱 토큰 색상
- [ ] DB/RLS/API 무변경, 상세페이지 회귀 없음
- [ ] `npx tsc --noEmit` · `npm run build` · `npm run lint`(신규 0) 통과

## 보고 양식
```
## 완료 보고 — 지시서 26 (#65) 아카이브 담기 Dialog
- 변경 파일: <목록>
- Dialog 래퍼/ArchiveButton 변경 요약: <요약>
- 클릭 수 변화(before→after): <요약>
- 검증: tsc · build · lint
- 미해결: <없으면 "없음">
```
