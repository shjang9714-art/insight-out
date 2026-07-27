# 작업계획서 — COUNCIL 브릿지 소스 확장 (insight-out)

**대상 레포:** `insight-out`. council 쪽은 이 4개 소스를 **이미 소비할 준비 완료**(전방호환,
빈 배열 폴백) — 브릿지가 응답만 주면 즉시 주제 역제안에 반영된다.
**목적:** `/api/council` REST 브릿지에 **핵심 인사이트·AI 리포트·경쟁사 주간·키워드** 4개 resource 추가.
**소요:** `src/app/api/council/route.ts` 한 파일에 분기 4개 추가. **커밋(PR) 필수.**

---

## 0. 배경

council 이 `/api/council?resource=<X>` 로 조회한다. 현재 지원: `search`(contents)·`content`·`issues`·`entities`.
council `fetchMiBundle` 이 아래 4개를 추가로 병렬 호출하는데, 브릿지에 없어 404→빈배열로 처리 중.
이 4개를 추가하면 토론 주제 역제안(TopicSuggestions)이 훨씬 풍부해진다.

인증·형식은 기존과 동일: Bearer `io_` read 토큰, JSON `{ items: [...] }` 반환.

---

## 1. 추가할 resource (council 이 기대하는 응답 계약)

각 분기를 기존 `if (resource === 'entities') { ... }` 뒤에 추가. **council 이 읽는 필드명은 고정**이니 아래 키로 매핑할 것.

### `resource=insights` — 핵심 인사이트 (daily_insights)
```ts
if (resource === 'insights') {
  const limit = Math.min(Number(searchParams.get('limit') ?? 6), 20)
  const query = searchParams.get('q') ?? undefined
  let q = admin
    .from('daily_insights')
    .select('id, headline, summary_ko, created_at')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (query) q = q.ilike('headline', `%${query}%`)
  const { data, error } = await q
  if (error) return jsonError(500, `DB 오류: ${error.message}`)
  const items = (data ?? []).map((r: Record<string, unknown>) => ({
    headline: r.headline,
    summary: r.summary_ko ?? null,   // ← council 은 {headline, summary}
  }))
  return NextResponse.json({ resource, count: items.length, items })
}
```

### `resource=reports` — AI 리포트 (ai_reports)
```ts
if (resource === 'reports') {
  // 컬럼명은 실제 스키마 확인(예: title, summary/summary_ko, published_at).
  // published_at IS NOT NULL(발행분)만. council 은 {title, summary} 를 읽음.
  // 매핑: { title: r.title, summary: r.summary ?? r.summary_ko ?? null }
}
```

### `resource=competitor` — 경쟁사 주간 리포트 (competitor_weekly_reports)
```ts
if (resource === 'competitor') {
  // lib/competitor-weekly/query.ts 의 CARD_COLUMNS 참고.
  // 최신 발행분 상위 N. council 은 {title, summary} 를 읽음.
}
```

### `resource=keywords` — 키워드 분석 (트렌딩 키워드)
```ts
if (resource === 'keywords') {
  // 트렌딩 키워드 소스(뷰/집계) 상위 N. council 은 {name, trend?} 를 읽음.
  // trend 는 '▲'/'▼'/증가율 등 있으면 채우고 없으면 생략.
}
```

> `title`/`summary`/`name` 매핑만 맞으면 council 이 그대로 소비한다. 컬럼명이 다르면 **매핑에서만** 맞춰주면 됨(응답 키는 위 고정).

---

## 2. 검증

```bash
npx tsc --noEmit
```
토큰으로 각 resource 확인(Authorization: Bearer io_...):
```
/api/council?resource=insights   → { items:[{headline, summary}, ...] }
/api/council?resource=reports    → { items:[{title, summary}, ...] }
/api/council?resource=competitor → { items:[{title, summary}, ...] }
/api/council?resource=keywords   → { items:[{name, trend?}, ...] }
```
토큰 없으면 401(JSON). `/login` 리다이렉트면 middleware publicPaths 확인(이미 `/api/council` 포함).

---

## 3. 커밋
```bash
git add src/app/api/council/route.ts
git commit -m "feat: COUNCIL 브릿지에 insights/reports/competitor/keywords resource 추가"
```

## 4. 전제 (council 쪽)
council `.env`(Vercel)에 `INSIGHT_OUT_API_URL` + `INSIGHT_OUT_READ_TOKEN` 설정돼야 브릿지를 호출한다.
미설정 시 council 은 MI 없이 동작(주제 제안 숨김).
