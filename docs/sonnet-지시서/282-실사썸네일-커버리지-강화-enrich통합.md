# 지시서 282 — 실사 썸네일 커버리지 강화 (본문보강 통합 + 품질게이트 + 실패재시도)

> David 결정: 카드 커버 단조로움 해소는 **"실사 사진 우선"부터**. 생성 폴백 풀(281)을 진짜 최후 폴백으로 밀어내려면 **`contents.thumbnail_url` 채움률**을 올려야 한다.
> 근거(코드 사실): 수집 시엔 RSS enclosure/media만 잡음(한국 RSS 대부분 미디어 없음). og:image는 `thumbnail-backfill.ts`(뉴스·웹인사이트 한정, 배치 10, `thumbnail_fetched_at` NULL 대상)로만 채워지고, 실패 시 `thumbnail_fetched_at`을 찍어 **영구 스킵**. → 실사 커버리지 낮음.

전제: 219 SQL(`contents.thumbnail_fetched_at` 컬럼) 적용됨(미적용 시 backfill `ready:false`). SQL 신규 없음.

대상: `src/lib/contents/full-body.ts`(ensureFullBody), `src/lib/contents/thumbnail-backfill.ts`, `src/lib/contents/cover-from-image.ts`(품질게이트), 크론/어드민 트리거.

---

## 0. 먼저 측정 (착수 전 1회)
- 카테고리별 `thumbnail_url` 채움률 파악(뉴스/웹인사이트/리포트/AI보고서/유튜브). 낮은 카테고리·기간을 확인해 효과 가늠. (간단 count 쿼리 or 어드민 소스품질/ai-jobs에 표시.)

## 1. 본문보강 시 og:image 동시 캡처 (최대 지렛대)
`full-body.ts`의 `ensureFullBody`는 이미 `extract(original_url)`를 호출한다(`@extractus/article-extractor`). 그 결과에 `.image`(og:image)가 있으므로 **한 fetch로 본문+이미지 동시 확보**:
- `ensureFullBody`(및 이를 쓰는 `/api/cron/body-backfill`)에서, 콘텐츠 `thumbnail_url`이 **null**이고 `extracted.image`가 있으면 → **품질게이트(§3) 통과 시** `copyExternalImageToCover`로 report-covers 복사 → `thumbnail_url` + `thumbnail_fetched_at` 저장.
- 이미 thumbnail_url 있으면 건드리지 않음. 추가 네트워크 fetch 없음(기존 extract 재사용).
- 결과: 본문 보강되는 모든 신규·백로그 콘텐츠가 실사 이미지를 함께 획득.

## 2. thumbnail-backfill 개선 (`thumbnail-backfill.ts`)
- **실패 재시도 모드**: 옵션 `mode: 'fresh' | 'retry'`. `retry`는 `thumbnail_url IS NULL AND thumbnail_fetched_at IS NOT NULL`(과거 실패)만 재대상 — 추출기 개선·소스 복구 후 재획득용(수동 "재시도" 실행). 기본 `fresh`는 현행(둘 다 null).
- **처리량**: 배치 기본 상향(예 10→20) + 크론 드레인이 실제 도는지 확인(`/api/cron/*` 썸네일 경로 있으면 deadline 반복으로 backlog 소진). 없으면 body-backfill 크론에 §1이 흡수하므로 별도 크론 불필요.
- **스코프**: 뉴스·웹인사이트 유지(+검토 후 `AI보고서` 추가 여지 — 리포트는 파일 자체라 제외). 유튜브는 별도(266).

## 3. 품질 게이트 (`cover-from-image.ts` 또는 호출부)
og:image가 로고·플레이스홀더·초소형이면 카드가 더 빈약해지므로 최소 기준:
- data:/svg/1x1·확장자 없는 트래킹 픽셀 제외. **최소 해상도**(예 가로<200 또는 세로<150) 스킵.
- 원격 이미지 HEAD/부분 로드로 크기 확인 가능하면 확인(불가 시 다운로드 후 sharp 등 기존 유틸로 치수 체크 — 신규 의존 없이 현행 이미지 처리 재사용).
- 게이트 실패 시 thumbnail_url 미설정(생성 폴백 유지) + `thumbnail_fetched_at`은 찍어 무한재시도 방지(단, §2 retry로 수동 재시도 가능).

## 4. 회귀 가드
- 219 미적용(42703): 기존처럼 `ready:false` graceful, 본문보강은 정상(이미지만 스킵).
- thumbnail_url 있는 콘텐츠 불변. 추가 fetch 없음(§1은 기존 extract 재사용).
- 품질게이트로 인해 채우던 정상 이미지가 과도 배제되지 않게 임계값 보수적.
- 281 폴백 체인 불변(실사 > og > 생성풀 > BrandedCover) — 채움률만 상승.
- copyExternalImageToCover 실패 graceful.

## 5. 검증 (Sonnet)
- `npx tsc --noEmit` 0 / `npx eslint` 0 / `npm run build`.
- 본문보강 1건에 og:image 있으면 thumbnail_url 채워짐(생성 폴백 대신 실사 노출).
- 품질게이트: 초소형/로고 URL 스킵 확인.
- retry 모드: 과거 실패행 재대상 확인.
- (측정) backfill/보강 후 뉴스 카테고리 thumbnail_url 채움률 상승.
- 커밋: `feat: 실사 썸네일 커버리지 강화 — 본문보강 og:image 통합 + 품질게이트 + 실패재시도 (지시서 282)`.

## 6. 후속 (이번 범위 아님)
- 채움률 측정 후 **2단계(풀 다양화)**: 고volume 토픽(AI기술·IT동향) 커버 8~12장 확충 + 결 다양화 + 반복 억제 회전(별도 지시).
- 실사 저품질 소스는 소스별 신뢰도로 생성풀 우선 규칙(선택).

SQL 신규 없음(219 전제). 이 지시서는 실사 썸네일 커버리지 강화.
