# 지시서 318 — prefetch 차단을 **전 라우트로** 확대 + **빌드 가드**

> 작성: Opus(플래너) · 2026-07-12 · 근거: 317 배포 후 DevTools 실측 — **UUID RSC 요청이 다시 수십 개**
> 협업 루프: 로컬(커밋X). 위임 → 구현 → 재현검증 → "커밋해" → 커밋·병합·푸시.
> **SQL 없음.** · 선행: 316(`4724955`) · 317 §3-1
>
> ⚠️ **번호 주의**: 이 318은 **316의 후속(성능)** 이다.
> 워킹트리에 `AdminContentManager.tsx` 변경분이 있고 Sonnet 이 그걸 **"318"** 이라 부르고 있는데,
> **그건 다른 레인의 구(舊) 318 이고 이미 `332` 로 옮겨졌다.** 이 지시서와 **무관하다. 건드리지 말 것.**

---

## 0. 한 줄

**316은 콘텐츠 상세 한 갈래만 막았다.** 이슈·기업·토픽·리포트 카드는 **여전히 미리 서버 렌더된다.**

---

## 1. 현행 진단 (검증된 코드 사실)

### 1.1 UUID RSC 요청이 돌아왔다 — **회귀가 아니라 미완**

`/dashboard/issues` 에서 측정:
```
UUID 이름 fetch   수십 개   각 680~950ms
issues  ×5+                 1.03~1.76초
recommended ×3              1.01~1.11초
```
저 UUID 들은 `/dashboard/contents/[id]` 가 **아니다.** **`/dashboard/issues/[id]` 등 다른 상세 라우트**다.

### 1.2 316은 **한 갈래만** 막았다

| 상세 라우트 | Link | `prefetch={false}` |
|---|---|---|
| `/dashboard/contents/[id]` | — | ✅ 30개 (316) |
| **`/dashboard/issues/[id]`** | | 🔴 |
| **`/dashboard/entities/[id]`** | | 🔴 |
| **`/dashboard/topics/[topic]`** | | 🔴 |
| **`/dashboard/daily-insights/[id]`** | | 🔴 |
| **`/dashboard/reports/[id]`** | | 🔴 |
| **`/dashboard/entities/competitor-weekly/[week]`** | | 🔴 |

**누락 25개** (전수 목록은 §3-1).
**모든 상세 라우트가 `force-dynamic` 이므로 prefetch = 실제 서버 렌더 + DB 쿼리다.** 카드 20개면 서버가 20번 렌더한다.

### 1.3 ✅ 회귀 없음 확인
- `DashboardHeader.tsx:278` 의 `prefetch={false}` 는 **알림 드롭다운** 링크다. **NAV_TABS 는 prefetch 유지** — 정상.
- 317 §3-1 정상: 네 페이지 모두 페이지 함수의 `await` 가 `searchParams` 뿐이다.

### 1.4 🔴 이걸 손으로 세는 건 **두 번째다**

316에서 30개를 손으로 찾았고, **오늘 25개를 또 찾았다.**
**다음 주에 26번째 카드가 생기면 또 샌다.** 사람이 지킬 규칙은 반드시 깨진다.
→ **§3-2: 빌드가 실패하게 만든다.**(루틴 템플릿 §5.2)

---

## 2. DB / SQL

**없음.**

---

## 3. 구현

### 3-1. 누락 25개에 `prefetch={false}`

```
src/components/analysis/LabBoard.tsx:93, :120
src/components/analysis/InsightCardNewsList.tsx:273
src/components/analysis/InsightCardsSectionClient.tsx:383
src/components/analysis/AiInsightBoard.tsx:174, :201, :265
src/components/dashboard/DailyInsightHomeHighlights.tsx:83
src/components/daily-insights/DailyInsightList.tsx:45
src/components/issues/IssueBoardClient.tsx:221, :280
src/components/entities/CompetitorWeeklyTimeline.tsx:34
src/components/entities/CompetitorWeeklyCard.tsx:25
src/components/entities/EntityBrowse.tsx:103
src/components/entities/KnowledgeGraph.tsx:790, :1066
src/components/reports/ReportCard.tsx:39
src/app/dashboard/insights/[id]/page.tsx:240
src/app/dashboard/contents/[id]/page.tsx:593
src/app/dashboard/issues/[id]/page.tsx:633, :658
src/app/dashboard/entities/[id]/page.tsx:476, :525
src/app/dashboard/entities/page.tsx:137
src/app/dashboard/reports/[id]/page.tsx:192
```

⛔ **상단 네비(`DashboardHeader` 의 `NAV_TABS`)와 L2 탭은 prefetch 를 유지할 것.**
**개수가 고정돼 있고 이동이 잦다.** 거기선 prefetch 가 이득이다. David 가 *"하위탭 이동은 빨라졌다"* 고 한 게 그 증거다.

> **원칙(316에서 세운 것): 목록에 N개씩 깔리는 링크는 prefetch 를 끈다. 개수가 고정된 네비게이션은 켠다.**

### 3-2. ⭐⭐ **빌드 가드** — 이게 이 슬라이스의 본체다

`scripts/check-prefetch.mjs` (신규):
- `src/**/*.tsx` 에서 `<Link ... >` 여는 태그를 훑는다.
- `href` 가 **동적 상세 라우트**를 가리키는데 `prefetch={false}` 가 없으면 → **목록 출력 후 `process.exit(1)`**

**동적 상세 라우트 판별은 `src/app` 디렉터리에서 유도할 것.** 정규식에 라우트를 손으로 박아 넣으면 **다음에 라우트가 늘 때 또 샌다** — 292 후속에서 `vercel.json` 을 단일 진실로 삼은 것과 같은 이유다.
```
src/app/dashboard/**/[*]/page.tsx  → 동적 상세 라우트
```

`package.json`:
```json
"prebuild": "node scripts/build-topic-cover-manifest.mjs && node scripts/check-prefetch.mjs"
```
→ **누락이 있으면 `npm run build` 가 실패한다. Vercel 배포도 실패한다.**

**예외를 허용해야 하면 명시적으로:**
```tsx
{/* prefetch-ok: 상세 1건뿐, 즉시 이동 유도 */}
<Link href={`/dashboard/reports/${id}`} …>
```
가드는 `prefetch-ok` 주석이 **바로 위 줄**에 있으면 통과시킨다.
⚠️ **예외를 쉽게 만들지 말 것.** 주석 없이 통과하는 뒷문을 두면 가드가 무의미해진다.

**검증(중요):** **일부러 한 곳의 `prefetch={false}` 를 지우고 `npm run build` 가 실패하는지 확인할 것.** 실패하지 않으면 가드가 죽은 것이다. **292 후속에서 이 방식으로 잡았다.**

### 3-3. 🟡 `recommended` ×3 — **이번엔 안 한다**

`/api/feed/recommended` 가 한 화면에서 **3번** 불린다(13.4KB · 6.68KB · 123B — 크기가 달라 **파라미터가 다르다**).
**원인을 모른 채 고치지 말 것.** 3-1·3-2 배포 후 **어느 컴포넌트가 부르는지 확인하고** 별도 슬라이스로.

---

## 4. 회귀 가드

- ⛔ **`NAV_TABS`(상단 5탭)와 L2 탭의 prefetch 를 끄지 말 것.** 개수가 고정돼 있고 이동이 잦다.
- ⛔ **`DashboardHeader.tsx:278`**(알림 드롭다운)의 기존 `prefetch={false}` 를 지우지 말 것.
- ⛔ **`force-dynamic`·`staleTimes`·316·317 을 되돌리지 말 것.**
- **`KnowledgeGraph.tsx`(790·1066)** 는 인스펙터 패널 링크다. **그래프 동작(290)을 건드리지 말 것 — `prefetch={false}` 한 속성만 추가.**
- **가드 스크립트가 `src/app/admin/**` 까지 잡아서 어드민 빌드를 깨뜨리지 않게 할 것.** 대상은 `src/app/dashboard/**` 상세 라우트다.
- **가드가 CI/Vercel 에서도 도는지 확인할 것**(`prebuild` 는 `npm run build` 앞에 붙으므로 돈다).

## 5. 검증 (Sonnet)

- `npx tsc --noEmit` 0 / `npx eslint` 0 / `npm run build`.
- ⭐ **가드가 살아있는지**: 아무 파일에서 `prefetch={false}` **하나를 지우고** `npm run build` → **실패해야 한다.** 되돌린 뒤 다시 성공.
- **가드가 잡은 개수 = 0** 인 상태로 커밋.
- **기능 회귀**: 이슈 카드·기업 카드·토픽 칩·리포트 카드·데일리인사이트 카드·관계지도 인스펙터 링크가 **여전히 클릭되는지**(prefetch 만 껐지 이동은 그대로여야 한다).
- 커밋: `perf: prefetch 차단 전 라우트 확대 + 빌드 가드 (지시서 318)`

**⭐ 실측 — David (프로덕션):**
- DevTools → Network → `rsc` 필터 → **이슈 페이지**를 연다
  - **UUID 이름 요청이 0개**여야 한다 (지금: 수십 개)
- **`issues` 요청 시간** (지금 1.03~1.76초) → 얼마로 줄었는지
- ⚠️ 317 때문에 **숫자가 커 보일 수 있다**(스트리밍). **탭·제목이 즉시 뜨는지 눈으로도 볼 것.**

## 6. 후속 (범위 밖)

- **`recommended` ×3 중복 호출**(§3-3) — 원인 규명 먼저.
- **콘텐츠 목록의 브라우저 → Supabase 직접 호출** (`services` 292ms → `sources` 237ms → `contents` 506~958ms). `contents/page.tsx` 834줄 클라이언트 컴포넌트. **309·313·297이 전부 여기 붙어 회귀 위험이 크다.** 별도 슬라이스.
- **리전 이전** — Vercel Observability 의 함수 실행 시간을 보고 판단(317 §3-0).
