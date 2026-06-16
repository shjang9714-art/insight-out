# 지시서 81 — RSS charset 디코딩 버그 픽스(제목/본문 깨짐·언어 오태깅)

> 작성: Opus(Cowork) · 대상: 구현 에이전트(Claude Code) · 검증: Opus · 커밋: 구현 에이전트
> ⚠️ 작업 전 `AGENTS.md` + `src/lib/crawler/adapters/news-site.ts`(parseURL·detectLanguage) + `src/lib/crawler/adapters/youtube.ts`(parseURL) + `src/lib/crawler/orchestrator.ts`(380~410 영어 번역 경로·`item.language`) + `src/lib/crawler/types.ts`(RawItem.language) 를 읽을 것. `npm install` 먼저.
> **DB·새 의존성 없음**(Node 내장 `TextDecoder` 사용). 단독 커밋. 긴급(수집 품질).

---

## 증상 (David)
수집 기사 제목/본문이 깨짐: `[PIS FAIR 2026 �̸�����] … �μ�����Ż-Okta …`, `[����ö���� (boanone@boannews.com)]`. 한국어 기사인데 **"영어 원문" 태그**가 붙음. (예: 보안뉴스 boannews.com)

## 근본 원인 (1개)
`rss-parser.parseURL` 이 피드를 **항상 UTF-8로 디코드**한다. 보안뉴스 등 **EUC-KR(ks_c_5601)** 피드는 깨짐(mojibake `�`). 그러면 `news-site.ts:detectLanguage = /[가-힣]/.test(text) ? 'ko':'en'` 이 한글을 못 찾아 **'en' 반환** → `original_language='en'` 저장 → 상세에서 "영어 원문" 태그(`[id]/page.tsx:237`) + 깨진 본문 영어 번역 시도(orchestrator 387). **인코딩만 고치면 깨짐·오태깅·오번역 셋 다 해소.** (Node `TextDecoder('euc-kr')` 동작 확인 — 새 의존성 불필요.)

## 작업

### 1. charset 인지 피드 페치 헬퍼 — `src/lib/crawler/fetch-feed.ts` (신규)
```ts
import 'server-only'

const CHARSET_ALIASES: Record<string, string> = {
  'ks_c_5601-1987': 'euc-kr', 'ksc5601': 'euc-kr', 'ksc_5601': 'euc-kr',
  'cp949': 'euc-kr', 'windows-949': 'euc-kr', 'euckr': 'euc-kr', 'ms949': 'euc-kr',
}

function normalizeCharset(raw?: string | null): string {
  const c = (raw ?? '').trim().toLowerCase().replace(/["']/g, '')
  if (!c) return 'utf-8'
  return CHARSET_ALIASES[c] ?? c
}

/** rss_url 을 charset 인지 디코드해 XML 문자열로 반환 */
export async function fetchFeedText(url: string, timeoutMs = 12_000): Promise<string> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; InsightOutBot/1.0)' },
      redirect: 'follow',
    })
    if (!res.ok) throw new Error(`피드 HTTP ${res.status}`)
    const buf = new Uint8Array(await res.arrayBuffer())

    // 1) Content-Type 헤더 charset
    let charset = ''
    const ct = res.headers.get('content-type') ?? ''
    const m = ct.match(/charset=([^;]+)/i)
    if (m) charset = m[1]

    // 2) 헤더에 없으면 선두 바이트에서 XML 선언/meta 스니핑(latin1로 읽어 선언만 파싱)
    if (!charset) {
      const head = new TextDecoder('latin1').decode(buf.subarray(0, 1024))
      const xmlEnc  = head.match(/<\?xml[^>]*encoding=["']?([\w-]+)/i)
      const metaEnc = head.match(/charset=["']?([\w-]+)/i)
      charset = xmlEnc?.[1] ?? metaEnc?.[1] ?? ''
    }

    const label = normalizeCharset(charset)
    try {
      return new TextDecoder(label).decode(buf)
    } catch {
      return new TextDecoder('utf-8').decode(buf) // 미지원 라벨 폴백
    }
  } finally {
    clearTimeout(timer)
  }
}
```

### 2. 어댑터에서 `parseURL` → `fetchFeedText` + `parseString`
- `news-site.ts`: `const feed = await parser.parseURL(source.rss_url)` → 
  ```ts
  const xml = await fetchFeedText(source.rss_url)
  const feed = await parser.parseString(xml)
  ```
- `youtube.ts`: 동일 교체(유튜브는 UTF-8라 무해하나 일관성·안전). import 추가.

### 3. `detectLanguage` 보강 (news-site.ts) — 비율 기반 + 깨짐 가드
```ts
function detectLanguage(text: string): string {
  if (text.includes('�')) return 'ko' // 잔여 깨짐 → 영어 오판/오번역 방지(보수적 ko)
  const hangul = (text.match(/[가-힣]/g) ?? []).length
  const latin  = (text.match(/[A-Za-z]/g) ?? []).length
  if (hangul === 0 && latin === 0) return 'ko'
  return hangul >= Math.max(2, latin * 0.15) ? 'ko' : 'en'
}
```
- 효과: 인코딩 정상화 후 한글 기사=‘ko’, 진짜 영문(한글 0)=‘en’ → 기존 `translateEnglishContent`(orchestrator 387)로 번역 유입. 브랜드명 등 소량 영어 섞인 한글 기사도 ‘ko’ 유지.

## 회귀 / 주의
- **이미 깨진 채 저장된 기존 행은 자동 복구 안 됨.** 수정·배포 후 ① "지금 수집" 재수집(신규분부터 정상) + ② 필요 시 어드민 "수집 기사 비우기"(지시서 58)로 크롤링분 비우고 재수집. (업로드 리포트는 보존.)
- `parser.parseString` 은 동일 옵션(customFields) 적용됨 — 파서 인스턴스 재사용.
- 타임아웃·UA 는 헬퍼가 담당(기존 parseURL timeout 12s 와 동일).
- gzip 응답은 fetch 가 자동 해제.
- **진짜 영어 기사 번역**은 `translateEnglishContent`(DeepL/Papago, `translate/index.ts`) + 예산 `MAX_TRANSLATIONS_PER_CRAWL=20`. 키 미설정/예산소진 시 번역 null → 영어 본문 유지 + 요약(summary_ko)만 한국어(설계 §13 온디맨드 번역). **번역이 전혀 안 되면 번역 프로바이더 키(env) 확인** — 이번 범위 밖(별도).
- 서버 전용 코드(`server-only`). `'use client'` 무관.

## 완료 조건
- [ ] `fetch-feed.ts` charset 인지 디코드(헤더→선언 스니핑→폴백)
- [ ] news-site·youtube 어댑터 `fetchFeedText`+`parseString` 전환
- [ ] `detectLanguage` 비율+깨짐 가드
- [ ] `npx tsc --noEmit` · `npm run build` · `npm run lint`(신규 0) 통과
- [ ] (가능 시) 보안뉴스 RSS 로 로컬 수집 1회 → 제목/본문 정상·`original_language='ko'`·"영어 원문" 태그 없음 확인

## 보고 양식
```
## 완료 보고 — 지시서 81 RSS charset 디코딩
- 변경/신규 파일: fetch-feed.ts(신규), news-site.ts, youtube.ts
- charset 인지 페치(헤더/선언/폴백) · parseString 전환 · detectLanguage 비율+깨짐 가드
- DB·의존성 무변경 · 검증: tsc · build · lint(신규 0) · (가능 시 EUC-KR 피드 수집 육안)
- 미해결: 기존 깨진 행 재수집/비우기 필요 · 영어 번역키(env) 별도
```

---

### 메모(후속)
- 풀본문 추출(`enrichRecentContents`/article-extractor, 지시서 66)도 charset 영향 가능 — article-extractor 는 자체 charset 처리하나, EUC-KR 본문 깨지면 동일 헬퍼 적용 검토(후속).
- 기존 'en' 오태깅 행 일괄 교정(언어 재판정 백필)은 선택 — 재수집이 더 간단.
- 관련: [[insight-out-뉴스수집-개선-로드맵]]
