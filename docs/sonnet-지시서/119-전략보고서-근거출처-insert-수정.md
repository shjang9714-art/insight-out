# 지시서 119 — 전략보고서 근거출처 저장 버그픽스 (ai_report_sources)

> 작성: Opus(Cowork) · 대상: 구현 에이전트(Claude Code) · 검증: Opus · 커밋: 구현 에이전트
> ⚠️ 작업 전: `src/app/api/reports/generate/route.ts`(118에서 신규) · `supabase/schema.sql`(ai_report_sources 인덱스 정의 확인).
> **신규 SQL 없음. DB 무변경. 코드 1곳만.**

---

## 배경 (118 재현검증에서 발견)

118 `generate` API의 근거출처 저장부가 부분 유니크 인덱스에 대해 `upsert(onConflict)`를 쓴다:

```ts
await supabase.from('ai_report_sources').upsert(sourceRows, { onConflict: 'ai_report_id,content_id', ignoreDuplicates: true })
```

`ai_report_sources`에는 `(ai_report_id, content_id)`에 대한 **부분** 유니크 인덱스(`... where content_id is not null`)만 있고 풀 유니크 제약·PK가 없다(`supabase/schema.sql`). PostgreSQL의 `ON CONFLICT` arbiter 추론은 부분 인덱스에 대해 statement에 predicate가 없으면 인덱스를 못 골라 **42P10**(`there is no unique or exclusion constraint matching the ON CONFLICT specification`)을 낼 수 있다.

게다가 이 호출은 반환 `error`를 확인하지 않아, 실패해도 **조용히 무시**된다 → 보고서(`ai_reports`)는 생성되지만 근거 콘텐츠(`ai_report_sources`)가 비어, 상세 페이지의 "근거 출처" 섹션이 빈칸이 된다.

## 설계 결정 (Opus)

- `reportId`는 직전에 `ai_reports.insert(...).select('id').single()`로 **새로 생성된 값**이라 `(ai_report_id, content_id)` 충돌이 구조적으로 불가능하다. `sourceContentIds`도 이미 `Array.from(new Set(...))`로 중복 제거됨.
- 따라서 `onConflict` 분기는 불필요한 dead path이자 위험 요소 → **plain `.insert()`로 교체**가 안전하고 정확하다.
- 에러는 무시하지 말고 `console.error`로 남긴다(보고서 본체는 이미 저장됐으므로 사용자 응답은 성공 유지 — 근거 누락은 비치명적).

## 작업

### `src/app/api/reports/generate/route.ts` — ai_report_sources 저장부 (1곳)

기존:
```ts
  if (sourceContentIds.length > 0) {
    const sourceRows = sourceContentIds.map((cid) => ({
      ai_report_id: reportId,
      content_id: cid,
    }))
    await supabase.from('ai_report_sources').upsert(sourceRows, { onConflict: 'ai_report_id,content_id', ignoreDuplicates: true })
  }
```

교체:
```ts
  if (sourceContentIds.length > 0) {
    const sourceRows = sourceContentIds.map((cid) => ({
      ai_report_id: reportId,
      content_id: cid,
    }))
    const { error: srcErr } = await supabase.from('ai_report_sources').insert(sourceRows)
    if (srcErr) console.error('[generate] ai_report_sources insert error:', srcErr)
  }
```

## (선택, 같이 처리 가능) 발견 2 — `?topic=` 미사용

`src/components/analysis/AiInsightsView.tsx`의 인사이트 카드 첫 "보고서로 만들기" 링크가 `?type=시장동향&topic=${...}`를 넘기지만, `new/page.tsx`는 `type`·`issue`만 읽는다(`topic`은 issue id가 아니라 매핑 모호). 크래시는 없으나 죽은 파라미터다. **링크에서 `&topic=...` 제거**(type만 유지):

```tsx
// AiInsightsView.tsx — 인사이트 카드 "보고서로 만들기" 링크
href={`/dashboard/reports/new?type=시장동향`}
```

## 검증 (구현 에이전트)
- `npx tsc --noEmit` 0
- `npx eslint src/app/api/reports/generate/route.ts src/components/analysis/AiInsightsView.tsx` 0
- (수동) 로그인 상태에서 이슈 1건 선택 → 초안 생성 → 상세 "근거 출처"에 콘텐츠 목록 표시 확인.

## 커밋
- `fix: 지시서 119 전략보고서 근거출처 저장(ai_report_sources insert)`
