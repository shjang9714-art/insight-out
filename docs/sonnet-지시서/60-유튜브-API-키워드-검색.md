# 지시서 60 — 유튜브 소싱 재설계: YouTube Data API 키워드 검색 (채널 RSS → 검색 기반)

> 작성: Opus(Cowork) · 대상: 구현 에이전트(Claude Code) · 검증: Opus · 커밋: 구현 에이전트
> ⚠️ 작업 전 `AGENTS.md` + `src/lib/crawler/orchestrator.ts`(crawlKeywordSearch·runCrawl 키워드 검색 블록·crawlYoutube) + `src/lib/crawler/adapters/youtube.ts` + `src/lib/crawler/quality.ts`(키워드 그룹 매칭·게이트) + `supabase/schema.sql`(youtube_videos·keyword_groups.search_seeds) 를 읽을 것. `npm install` 먼저.
> **DB 변경 없음**(youtube_videos·keyword_groups 기존 컬럼 재사용). 신규 env 1개(`YOUTUBE_API_KEY`) → `.env.example` 갱신 필수(Hard Rule #5).

---

## 배경

현재 유튜브 수집은 **채널 RSS(Atom) 피드 단위**(`crawlYoutube` + `adapters/youtube.ts`)로, 등록된 채널의 **최근 업로드 전부**를 `youtube_videos` 에 적재한다. 관련도 필터가 전혀 없어(youtube_videos 엔 status·score 컬럼도 없음) **주제 무관 영상이 그대로 노출**된다. 무관 채널·영상은 별도 SQL 핸드오프(`docs/sql-handoff/유튜브-영상-청소.sql`)로 청소 완료(예정).

재설계 방향(David 확정): **채널 RSS 대신 YouTube Data API 키워드 검색**으로 소싱한다. 뉴스의 Google News 키워드 검색(지시서 56, `crawlKeywordSearch`)과 동일한 발상 — `keyword_groups.search_seeds` 를 질의어로 써서 채널을 가로질러 **주제에 맞는 영상만** 가져온다.

### 설계 결정(Opus, David 확정 B안 기반 — 이의 시 검증 단계에서 조정)
1. **`youtube_videos` 테이블 유지.** 60 은 "영상을 가져오는 출처"만 바꾼다(채널 RSS → API 검색). contents 통합(분류 재편)은 별도 후속 트랙 — 마이그레이션 불필요.
2. **키 우선·인프라 우선(LLM 게이트웨이 패턴 미러).** `YOUTUBE_API_KEY` 없으면 **graceful skip**(throw 금지, 로그만). 키 등록은 David/수희 액션(Vercel env) — 코드는 키 도착 즉시 동작하도록 미리 완성.
3. **`keyword_groups.search_seeds` 재사용**(신규 컬럼 X). 시드 합집합·중복제거·상한은 기존 키워드 검색과 동일. (유튜브 전용 시드 분리는 결과 노이즈 보고 후 후속 판단.)
4. **제목 관련도 게이트 적용.** 검색 결과 제목을 기존 keyword_groups 스코어링(threshold + EXCLUDE 블랙리스트)으로 평가 → **미달 영상은 insert 자체를 skip**(youtube_videos 에 status 없음 → 저장 안 하는 방식으로 클린 유지).
5. **채널 RSS 경로(`crawlYoutube`)는 제거하지 않고 그대로 둔다**(휴면). 청소 후 youtube_channel 소스가 없으면 자연히 미실행. 향후 필수 채널(통신사 공식 등) 추가 시 재사용 가능.
6. **외부 의존성 추가 없음** — YouTube Data API v3 는 REST(`fetch`)로 호출(신규 npm 패키지 금지, Hard Rule 준수).

---

## 작업

### 1. 신규 env: `YOUTUBE_API_KEY`
- `.env.example` 에 `YOUTUBE_API_KEY=` 추가(주석: YouTube Data API v3 키, Vercel Production 등록 필요). 실제 값은 commit 금지(#4).
- 서버 전용(NEXT_PUBLIC_ 접두사 금지). 크롤러는 서버에서만 도므로 안전.

### 2. 신규 어댑터 `src/lib/crawler/adapters/youtube-search.ts`
- `searchYoutube(query: string, since: string, opts?): Promise<YoutubeRawItem[]>`
  - YouTube Data API v3 `GET https://www.googleapis.com/youtube/v3/search` 호출:
    - `part=snippet`, `type=video`, `order=date`, `q=<query>`, `maxResults=<상한, 기본 10~25>`, `publishedAfter=<since ISO>`, `regionCode=KR`, `relevanceLanguage=ko`(가능 옵션), `key=YOUTUBE_API_KEY`.
  - 응답 매핑 → 기존 `YoutubeRawItem`({ videoId, title, channelId, published_at }) **+ 추가로 channelTitle·thumbnailUrl** 를 담을 수 있게 반환 타입 확장(예: `YoutubeSearchItem`). video_id = `item.id.videoId`, title/channelTitle/publishedAt/thumbnails = `item.snippet.*`.
  - 키 없음/HTTP 오류/quota 초과(403 quotaExceeded) → **빈 배열 반환 + console.warn**(throw 금지). 호출부가 graceful 하게 다음 시드로 넘어가도록.
- duration_seconds·view_count 는 search.list 로 안 옴 → **null 로 둔다**(videos.list 추가 호출은 quota 2배 → v1 범위 밖, 후속).

### 3. orchestrator: `crawlYoutubeSearch`
- `crawlKeywordSearch` 를 본떠 `crawlYoutubeSearch(admin, seeds, groups, ...)` 추가:
  - 각 seed 마다 `searchYoutube(seed, since)` → 결과 영상 순회.
  - **제목 게이트**: 기존 quality.ts 의 키워드 그룹 스코어링/EXCLUDE 로직을 제목에 적용 → 미달 시 skip(counts.rejected++).
  - 통과 영상은 `youtube_videos` 에 insert(기존 `crawlYoutube` 의 row 형태 재사용: source_id=**null**, channel_name=channelTitle, thumbnail_url=API 썸네일 또는 `https://i.ytimg.com/vi/<id>/hqdefault.jpg` 폴백, published_at). **video_id 유니크(23505)=중복 스킵**(멱등).
  - lookback: 기존 `KEYWORD_LOOKBACK_DAYS`(또는 유튜브용 상수 신설) 사용. since = `getDaysAgoStartKst(...)`.
  - 시드 상한(`MAX_YT_SEARCH_SEEDS`)·maxResults 로 quota 관리(search.list=100유닛/호출, 기본 일 10,000유닛). 합집합·중복제거는 키워드 검색과 동일.
  - 반환: `{ counts, hadError }`(키워드 검색과 동형).
- **runCrawl 통합**: 기존 "키워드 검색 수집" 블록(개별 소스 수집 시 skip되는 곳) **바로 뒤**에 동일 가드(`!options.sourceIds?.length`)로 `crawlYoutubeSearch` 호출. 집계(totalFetched/inserted/duplicate/rejected) 합산 + details 에 `source: 'YouTube 키워드 검색'` 행 추가. `YOUTUBE_API_KEY` 없거나 seeds 0이면 호출 skip.

### 4. (선택) search_seeds 의 유튜브 적합성
- 현 search_seeds 는 Google News 질의 목적. 그대로 재사용하되, 노이즈가 심하면 후속에서 유튜브 전용 시드 컬럼 분리(SQL) 검토 — **이번 범위 밖**.

## 회귀 / 주의
- DB 무변경. 기존 채널 RSS 경로(`crawlYoutube`)·youtube_videos 스키마·뉴스 키워드 검색 모두 정상.
- `YOUTUBE_API_KEY` 미설정 환경(로컬·키 등록 전 Production)에서 **빌드·크롤이 깨지지 않아야 함**(graceful skip).
- search_seeds 는 SQL 56 적용 후에만 존재 → 미적용 시 seeds 0 → 유튜브 검색도 자연 skip(에러 금지, 기존 키워드 검색과 동일 방어).
- quota 초과(403) 시 해당 run 만 일부 누락, 다음날 정상 — 사용자 영향 없음.
- UI 텍스트·주석 한국어(#1). 색상 토큰·hex 신규 없음(크롤러 백엔드 작업).

## 완료 조건
- [ ] `.env.example` 에 `YOUTUBE_API_KEY` 추가(값 commit X)
- [ ] `adapters/youtube-search.ts`: search.list 호출 + 매핑 + 키없음/오류 graceful 빈배열
- [ ] `crawlYoutubeSearch`: 제목 게이트 + youtube_videos 멱등 insert(source_id null) + 시드/maxResults 상한
- [ ] runCrawl 통합(키워드 검색 블록 뒤, sourceIds 지정 시 skip, 키/seeds 없으면 skip)
- [ ] 채널 RSS 경로 무변경(휴면 유지)
- [ ] `npx tsc --noEmit` · `npm run build` · `npm run lint`(신규 0) 통과
- [ ] 육안(키 등록 후): "지금 수집" → /dashboard/youtube 에 주제 관련 영상만, 무관 영상 미유입

## 보고 양식
```
## 완료 보고 — 지시서 60 유튜브 API 키워드 검색
- 변경 파일: <목록>
- env(YOUTUBE_API_KEY)·youtube-search 어댑터·crawlYoutubeSearch(제목게이트·멱등)·runCrawl 통합
- 키 없음/quota 초과 graceful skip 확인
- DB 무변경 · 검증: tsc · build · lint(신규 0)
- 미해결: <키 등록(David/수희) 후 육안 검증 등>
```

---

### 메모(David/수희 액션 · 후속)
- **David/수희 액션**: Google Cloud 콘솔에서 YouTube Data API v3 사용 설정 + API 키 발급 → **Vercel Production env `YOUTUBE_API_KEY` 등록 + 재배포**. (David 는 Vercel 접근 없음 → 수희 등 접근자 입력.)
- 후속 후보: duration/view_count 보강(videos.list), 유튜브 전용 search_seeds 컬럼 분리, youtube_videos→contents 통합(분류 재편 트랙), LLM 제목 관련도 판정(B3).
