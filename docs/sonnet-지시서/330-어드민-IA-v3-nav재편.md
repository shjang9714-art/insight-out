# 지시서 330 — 어드민 IA v3: nav 재편 + `ai-jobs` 2화면 분리

> ⚠️ **번호 주의**: 원래 316이었으나 **다른 레인의 `316-속도개선-묶음.md`(2026-07-12)와 충돌**하여 **330**으로 옮겼다.
> 그쪽 316은 이미 구현이 시작됐다(`f819fdf` — §3-1 staleTimes). **317~329는 그 레인의 완충 대역으로 비워둔다.**

> 작성: Opus(플래너) · 2026-07-13 · 근거: David 스펙("인사이트 아웃 개선") + 현황 대조 `docs/어드민개편-현황대조-2026-07-13.md`
> 협업 루프: 로컬(커밋X). 위임 → 구현 → 재현검증 → "커밋해" → 커밋·병합·푸시.
> **SQL 없음.**
> ⛔ **이 슬라이스가 `nav.ts`를 단독 소유한다.** 331·332는 `nav.ts`를 건드리지 않는다. (인수인계 §4-3 — 병렬 레인이 세 번 사고를 냈다)

---

## 0. 한 줄

어드민 메뉴를 **확정 IA(8그룹 27항목)** 로 재배치하고, **`/admin/ai-jobs` 한 화면에 섞여 있던 LLM 작업과 룰 기반 작업을 두 화면으로 분리**한다.

---

## 1. 현행 진단 (2026-07-13 워킹트리 확인)

### 1.1 nav는 8그룹 26항목 (`src/lib/admin/nav.ts:48-261`)
```
운영센터(3) 수집·크롤링(5) 콘텐츠·분류(5) AI 운영(3)
인사이트·리서치(5) 발행·구독(2) 사용자·분석(1) 시스템 설정(4)
```
`AdminSidebar.tsx:142`가 `ADMIN_NAV_GROUPS`를 그대로 렌더한다. **nav.ts가 단일 진실**이다.
`findAdminNavItem()`(`nav.ts:264`)이 pathname → 항목을 역조회해 `AdminPageHeader`의 제목·설명을 만든다. **href를 바꾸면 헤더도 따라 바뀐다.**

### 1.2 ⭐ `/admin/ai-jobs`는 **두 섹션이 한 화면**에 있다
`src/app/admin/ai-jobs/page.tsx`(245줄):
- 섹션 ① "AI 콘텐츠 보강" (`:132`, `Sparkles`) — 버튼 4개, **전부 인라인**으로 이 파일에 있다
- 섹션 ② "데이터 보강·재처리" (`:240`) — `<AdminContentProcessing />` 컴포넌트 렌더

### 1.3 🔴 섹션 분류가 **LLM 사용 여부와 어긋나 있다** (확인함)

| 버튼 | 현재 섹션 | 실제 LLM |
|---|---|---|
| 논조 분석 (`page.tsx:141`) | AI 보강 | ✅ `lib/insight/sentiment.ts` |
| 위기·기회 분석 (`:165`) | AI 보강 | ✅ `lib/insight/lgu-impact.ts` |
| 유튜브 요약 생성 (`:219`) | AI 보강 | ✅ `lib/insight/youtube-summary-backfill.ts` |
| **유튜브 태그 생성** (`:192`) | AI 보강 | ❌ **룰 기반** — `orchestrator.ts:146-190` `tagYoutubeContent()` = `matchKeywordGroups` + alias 맵 |
| **뉴스 요약 백필** (`AdminContentProcessing.tsx:465`) | 데이터 보강 | ✅ `summarizeKo` |
| **신호 분류** (`:491`) | 데이터 보강 | ✅ `lib/contents/classify-signals.ts:38` |
| 본문 수집(`:438`) · URL 정규화(`:517`) · 썸네일(`:544,553`) · 자막(`:581,590`) · PDF표지(`:618,627`) · 관련기사(`:654`) | 데이터 보강 | ❌ 없음 |

### 1.4 라우트 현황
`/admin/ai-jobs` 는 실재하는 유일한 라우트다. `/admin/enrich`·`/admin/tts`·`/admin/analytics` **grep 0회 — 없다.**

---

## 2. DB / SQL

**없음.**

---

## 3. 구현

### 3-1. `src/lib/admin/nav.ts` — 확정 IA로 재배치

```
1. 운영센터
   /admin                  운영 대시보드
   /admin/requests         운영 게시판
   /admin/job-runs         작업 이력

2. 수집·크롤링
   /admin/sources          소스 관리
   /admin/source-quality   소스 품질          ← 통합은 후속 슬라이스. 지금은 항목 유지
   /admin/crawl-logs       크롤 실행 로그
   /admin/exclusion-rules  제외 규칙          ← "키워드 규칙" 통합은 후속. 지금은 유지
   /admin/crawl-settings   수집 설정          ← 후속에 흡수. 지금은 유지
   /admin/keywords         키워드             ← 콘텐츠·분류에서 이동
   /admin/keyword-groups   키워드 그룹·시그널 기준  ← 이동
   /admin/entities         엔티티 사전         ← 이동 (David 결정)

3. 콘텐츠 검수
   /admin/contents         콘텐츠 검수
   /admin/upload           콘텐츠 추가
   /admin/enrich           데이터 보강 재처리   ← ⭐ 신설 (§3-2)

4. AI 운영
   /admin/llm              LLM 관리
   /admin/translation      번역 관리
   /admin/tts              TTS 관리            ← 신설은 후속 슬라이스. **이번엔 만들지 않는다**
   /admin/ai-jobs          AI 콘텐츠 보강      ← ⭐ 라벨 변경 ("일괄 작업 관리" → "AI 콘텐츠 보강")

5. 인사이트·리서치   (변경 없음 — issues · insights · daily-insights · competitor-weekly · reports)
6. 발행·구독        (변경 없음 — briefings · newsletter)
7. 사용자·분석      /admin/users 사용자 관리   ← 참여 분석은 후속 슬라이스
8. 시스템 설정      (변경 없음 — settings · homepage-sections · mcp · maintenance)
```

- **"콘텐츠·분류" 그룹은 해체된다.** 검수/추가는 "콘텐츠 검수"로, 키워드·키워드그룹·엔티티는 "수집·크롤링"으로.
- ⛔ **`/admin/tts` 와 참여 분석은 이번에 만들지 않는다.** nav에 없는 항목을 넣으면 404가 난다. **후속 슬라이스에서 라우트와 함께 추가한다.**
- `AdminNavItem.disabled`가 이미 있다(`nav.ts:38`). 굳이 disabled 항목으로 미리 넣지 말 것 — **없는 메뉴는 안 보이는 게 낫다.**

### 3-2. ⭐ `/admin/ai-jobs` → 두 화면으로 분리

**신설: `src/app/admin/enrich/page.tsx` — "데이터 보강 재처리" (비-LLM)**
- `<AdminContentProcessing />` 를 **여기로 옮긴다.**
- **`유튜브 태그 생성`을 여기로 이동** — 룰 기반이다(§1.3). `ai-jobs/page.tsx:186-216`의 카드를 그대로 가져온다(`POST /api/admin/youtube-tagging`, 최대 100건).
- `AdminContentProcessing` 안에서 **LLM을 쓰는 두 카드**(`뉴스 요약 백필 :465` · `신호 분류 :491`)를 **떼어내 `/admin/ai-jobs`로 보낸다.**

**개편: `src/app/admin/ai-jobs/page.tsx` — "AI 콘텐츠 보강" (LLM 전용)**
- 남는 것: 논조 분석 · 위기·기회 분석 · 유튜브 요약 생성 + **이관받은** 뉴스 요약 백필 · 신호 분류 = **5개**
- 페이지 제목/설명은 `nav.ts`가 공급하므로(`findAdminNavItem`) **파일에 하드코딩된 제목이 있으면 제거**하고 nav에 맡길 것.

**라우트 이동 가드**: `/admin/ai-jobs` 는 **URL을 유지한다**(라벨만 변경). 인수인계에서 David가 매일 여는 화면이고, 링크가 여러 곳에 박혀 있다:
```
확인 필요 — grep -rn "/admin/ai-jobs" src/  로 전수 확인하고 보고할 것
```

### 3-3. 각 카드가 어느 화면에 있어야 하는지 — **코드로 강제**

루틴 §5.2("규칙은 코드로 강제한다"). 주석으로 "LLM 쓰는 건 ai-jobs에 두세요"라고 부탁하면 **깨진다**(292의 `EXPECTED_CRONS`가 하루에 두 번 어긋났다).

`src/lib/admin/enrich-jobs.ts` (신설)에 **작업 메타를 단일 진실로** 둔다:

```ts
export type EnrichJobSurface = 'ai' | 'data'   // ai = /admin/ai-jobs, data = /admin/enrich

export interface EnrichJobMeta {
  key: string            // job_runs의 job_key와 일치시킬 것
  label: string
  endpoint: string
  usesLlm: boolean
  surface: EnrichJobSurface
}

export const ENRICH_JOBS: EnrichJobMeta[] = [ ... ]

// 규칙: usesLlm ↔ surface 가 어긋나면 모듈 로드 시 throw → 빌드 실패
for (const j of ENRICH_JOBS) {
  if (j.usesLlm !== (j.surface === 'ai')) {
    throw new Error(`[enrich-jobs] ${j.key}: usesLlm=${j.usesLlm} 인데 surface=${j.surface} 다.`)
  }
}
```

두 페이지는 `ENRICH_JOBS.filter(j => j.surface === 'ai' | 'data')` 로 렌더한다.
**새 작업을 잘못된 화면에 추가하면 빌드가 깨진다.** 292 후속이 `vercel.json`으로 한 것과 같은 방식이다.

---

## 4. 회귀 가드

- ⛔ **`AdminNavItem` 인터페이스·`findAdminNavItem()` 시그니처를 바꾸지 말 것.** `AdminPageHeader`가 의존한다.
- ⛔ **nav에 라우트 없는 항목을 넣지 말 것** (`/admin/tts`, 참여 분석 — 이번 슬라이스 범위 밖).
- **12개 작업 버튼의 API·파라미터·`runJob` 계측을 하나도 바꾸지 말 것.** 화면만 옮긴다. `job_runs`의 `job_key`가 바뀌면 **작업 이력이 끊긴다.**
- **`AdminContentProcessing`의 `stopRef` 중단 토글·폴링 루프를 유지할 것.** 카드를 떼어낼 때 같이 깨지기 쉽다.
- `/admin/ai-jobs` **URL 유지.** 링크 전수 확인 후 보고.
- 사이드바 검색(`AdminSidebar.tsx:58-65`)은 `label`·`description` 기준이다. **라벨을 바꾸면 검색어도 바뀐다** — 정상 동작인지 확인.
- **엔티티 사전(1,227줄)은 그룹만 옮긴다.** 코드는 건드리지 않는다.

## 5. 검증

- `npx tsc --noEmit` 0 / `npx eslint` 0 / `npm run build` 통과 (**빌드는 반드시 네가 돌릴 것** — 플래너 샌드박스는 Bus error로 못 돌린다)
- ⭐ **`ENRICH_JOBS`의 `usesLlm`을 일부러 하나 뒤집어 보고 빌드가 실패하는지 확인.** 실패하지 않으면 §3-3이 무의미하다. 확인 후 되돌릴 것.
- 사이드바에 **8그룹**이 뜨고, "콘텐츠·분류"가 **사라졌는지**
- `/admin/enrich` 가 열리고, 카드 **8개**(본문수집·URL정규화·썸네일·자막·PDF표지·관련기사·유튜브태그)가 있는지
- `/admin/ai-jobs` 가 **"AI 콘텐츠 보강"** 으로 뜨고, 카드 **5개**(논조·위기기회·유튜브요약·뉴스요약백필·신호분류)인지
- 각 버튼을 **1회씩 실제로 눌러** `/admin/job-runs`에 기록이 남는지 (인수인계 §4-1 — "graceful인데 silent")
- `grep -rn "/admin/ai-jobs" src/` 결과를 **보고에 첨부**

## 6. 후속(범위 밖)

- 소스관리 + 소스품질 통합
- 키워드 규칙 통합 (keywords + keyword-groups + exclusion-rules + crawl-settings)
- `/admin/tts` 신설 · 참여 분석(DAU/MAU·북마크한 사람) 신설
- 공통 `AdminTable` 컴포넌트 (어드민 16개 테이블)
