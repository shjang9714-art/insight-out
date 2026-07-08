# 지시서 218 — 어드민 생 red-* → 시맨틱 토큰 정리 + AdminErrorBox 공통화

목표: 어드민 전반의 생 `red-*` Tailwind 색을 어드민 테마 토큰(`negative`/`destructive`)으로 교체하고, 반복되는 오류 박스 마크업을 공유 `AdminErrorBox`로 통일한다. 다크/라이트 양쪽에서 어드민 무드 레드(204)로 일관.

범위(David): A안 — 공통 컴포넌트화 + 전체 정리(어드민 전 컴포넌트, 약 19파일·90여 곳). 신규 SQL 없음.

---

## 1. 현행 진단 (검증된 코드 사실)

### 토큰·유틸 가용성
- Tailwind v4 `@theme inline`(`src/app/globals.css` 7–58)이 CSS 변수를 유틸로 노출: `--color-destructive`, `--color-negative`, `--color-negative-soft`, `--color-risk`, `--color-risk-soft`. → `text-negative`, `bg-negative-soft`, `border-negative`, `text-destructive`, `bg-destructive` 등 사용 가능(불투명도 변형 `bg-destructive/10`도 v4 지원).
- 어드민 스코프 토큰값(globals.css 379–426): light `--negative:#DC2626`·`--negative-soft:#FEF2F2`·**`--destructive:#C4564C`(204 톤다운)**; dark `--negative:#EF4444`·`--negative-soft:rgba(239,68,68,.14)`·`--destructive:#DD8079`.

### 코드베이스에 이미 정착된 관례(따를 기준)
- **오류 메시징 = `negative`**: `CrawlLogsTable.tsx:178` = `border border-negative/20 bg-negative-soft ... text-negative`(정식 오류 박스). `NewsletterManager`·`IssueManager`·`ExclusionRulesManager`의 실패/오류 텍스트 `text-negative`.
- **위험 액션·심각도 = `destructive`**: `AdminOpsSignals.tsx:33/37`·`AdminContentHealth.tsx:25/50`의 `bg-destructive`/`text-destructive`(초과·위험 표시). `AdminDataReset`의 삭제 결과 `text-destructive`.

### 생 red-* 현황(교체 대상) — 약 90여 곳/19파일
파일별: SourceManager(14) · EntityManager(14) · KeywordManager(8) · KeywordGroupManager(7) · IssueManager(6) · UserManager(5) · LlmManager(5) · AdminContentManager(3) · TextPasteForm(2) · ReportUploadForm(2) · BriefingManager(2) · app/admin/insights/page(2) · UrlImportForm(1) · TranslationStatusManager(1) · NewsletterManager(1) · CrawlLogsTable(1) · CoverImageField(1) · AdminContentProcessing(1) · app/admin/crawl-logs/page(1).

패턴별 빈도: `text-red-600`(46) · `bg-red-50`(46) · `border-red-100`(25) · `text-red-500`(14) · `text-red-700`(13) · `border-red-200`(8) · `text-red-400`(7) · `bg-red-500`(2).

가장 흔한 반복 마크업(오류 박스, ~10곳):
`<div className="... rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">` (일부는 우측 "닫기" `text-red-400 ... hover:text-red-600` 버튼 포함).

---

## 2. 구현

### 2-1. 공유 컴포넌트 `src/components/admin/ui/AdminErrorBox.tsx` 신설
정식 오류 박스 토큰(negative)으로, dismiss 유무 두 형태 지원:
```tsx
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

export default function AdminErrorBox({
  children, onDismiss, className,
}: { children: ReactNode; onDismiss?: () => void; className?: string }) {
  return (
    <div className={cn(
      'flex items-start justify-between gap-4 rounded-lg border border-negative/20 bg-negative-soft px-4 py-3 text-sm text-negative',
      className,
    )}>
      <div className="min-w-0">{children}</div>
      {onDismiss && (
        <button type="button" onClick={onDismiss}
          className="ml-4 shrink-0 text-negative/70 underline hover:text-negative">
          닫기
        </button>
      )}
    </div>
  )
}
```
- 반복 오류 박스(닫기 버튼 포함/미포함 모두)를 이 컴포넌트로 교체. 내부에 `*` 필수표시 등 다른 요소가 섞인 폼 상단 에러도 children으로 감싸 교체.

### 2-2. 매핑 규칙 — 전 어드민 생 red-* 전수 교체
`src/components/admin/**` + `src/app/admin/**`에서 아래 표대로 교체(grep로 잔여 0 확인):

| 용도 | 현행 | → 교체 |
| --- | --- | --- |
| 오류 박스 | `border-red-100 bg-red-50 ... text-red-600` (+닫기 `text-red-400 hover:text-red-600`) | **`<AdminErrorBox>`** (dismiss는 `onDismiss`) |
| 인라인 오류 텍스트 | `text-red-500` / `text-red-600` (`<p>`·`<span>` 에러 메시지) | `text-negative` |
| 실패/거절 배지 | `border-red-200 bg-red-50 text-red-700` | `StatusBadge tone="negative"` 재사용, 불가 시 `border-negative/30 bg-negative-soft text-negative` |
| 필수 표시 `*` | `text-red-500` | `text-destructive` |
| 삭제/파괴 버튼·hover | `hover:bg-red-50 hover:text-red-600`, `text-red-600`(삭제 액션) | `hover:bg-destructive/10 hover:text-destructive`, `text-destructive` |
| 심각도 바 | `bg-red-500`(≥90/100%) | `bg-destructive` |
| dismiss 링크(박스 밖) | `text-red-400 ... hover:text-red-600` | `text-negative/70 hover:text-negative` |

원칙: **오류/실패 메시징 = negative, 위험·파괴 액션·심각도 = destructive.** 판단 애매하면 "메시지면 negative, 클릭 액션이면 destructive".

### 2-3. 주의
- `bg-amber-500` 등 red 아닌 색은 범위 밖(건드리지 않음).
- StatusBadge에 negative tone이 이미 있으므로(`bg-negative-soft text-negative`) 배지는 가급적 StatusBadge 재사용.
- 공개(사용자) 화면 파일은 범위 밖 — `src/components/admin`·`src/app/admin`만.

---

## 3. 회귀 가드
- **grep 잔여 0**: 작업 후 `grep -rn "red-[0-9]" src/components/admin src/app/admin` 결과 없음(또는 의도적 예외만, 있으면 사유 주석).
- 오류 박스: 문구·닫기 동작·레이아웃 동일(토큰만 교체).
- 다크/라이트 양쪽에서 오류=차분한 negative, 삭제/위험=destructive로 대비 확인.
- StatusBadge로 바꾼 배지의 라벨·크기 동일.
- 기존 `negative`/`destructive` 사용처(CrawlLogsTable:178 등)와 시각적으로 통일.
- 로직 변경 없음(색·컴포넌트 래핑만).

## 4. 검증
- `npx tsc --noEmit` 0, `npx eslint`(수정/신규 파일) 0, `npm run build`.
- `grep -rn "red-[0-9]" src/components/admin src/app/admin` → 0 확인(리포트에 포함).

## 5. 라이브 체크리스트
- [ ] 각 어드민 화면의 오류 박스가 동일 스타일(AdminErrorBox)로 통일 — 라이트/다크 모두.
- [ ] 폼 필수 표시 `*`가 destructive 색.
- [ ] 삭제 버튼 hover가 destructive 톤.
- [ ] 거절/실패 배지가 negative 톤(StatusBadge).
- [ ] LLM 사용량 바 초과분이 destructive.
- [ ] 콘솔·화면에 깨진 색/누락 없음.

SQL 없음.
