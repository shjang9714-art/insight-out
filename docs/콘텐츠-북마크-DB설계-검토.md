# 📐 Phase 1-B · 콘텐츠 + 북마크·아카이빙 DB 스키마 설계 (수희 검토용)

> 대상: Opus 작업 **#1 콘텐츠 DB 스키마** + **#2 북마크·아카이빙 DB 스키마**
> 산출물: `supabase/schema.sql` 확장 · [`콘텐츠-북마크-ER다이어그램.mermaid`](./콘텐츠-북마크-ER다이어그램.mermaid) · 본 문서
> 근거: PRD 4(데이터 소스)·5(핵심 기능)·6(어드민), [`작업계획서.md`](./작업계획서.md), UX 로드맵
> 작성: 2026-05-30 · 검토 상태: 🔵 검토 중

---

## 0. 한 줄 요약

신규 **테이블 11개 + enum 4개**를 기존 `schema.sql` 끝에 추가했습니다. 기존 컨벤션(UUID PK·`set_updated_at` 트리거·`is_admin()`·한국어 RLS 정책명)을 그대로 따랐고, **libpg_query(실제 Postgres 파서)로 전체 파싱 검증 완료** — 문법 오류 0.

---

## 1. 신규 테이블 한눈에

**콘텐츠 도메인 (8개)**

| 테이블 | 역할 |
|---|---|
| `sources` | 수집 출처 카탈로그 (뉴스사이트/리서치처/오피니언/뉴스레터/유튜브채널) |
| `keywords` | 키워드 카탈로그 (트렌드 분석·경쟁사 추적) |
| `contents` | 메인 콘텐츠 — 뉴스/리포트/오피니언/뉴스레터 단일 테이블 |
| `content_services` | 콘텐츠 ↔ 서비스 (N:M) |
| `content_keywords` | 콘텐츠 ↔ 키워드 (N:M) |
| `youtube_videos` | 유튜브 영상 (영상 메타 구조가 달라 별도) |
| `ai_reports` | AI 보고서 (사용자 생성) |
| `ai_report_sources` | AI 보고서 ↔ 참조 콘텐츠 (N:M) |

**북마크·아카이빙 도메인 (3개)**

| 테이블 | 역할 |
|---|---|
| `bookmarks` | 단순 즐겨찾기 (유저별) |
| `archives` | 사용자 컬렉션 (메일 발송 단위) |
| `archive_items` | 아카이브 ↔ 콘텐츠 (N:M) + 메일용 메모 |

**신규 enum 4개**: `content_category`(8) · `source_type`(5) · `ai_report_type`(5) · `ai_report_status`(4)

---

## 2. 핵심 설계 결정 11개

David 확정 3건 + 권장 default 8건.

| # | 결정 | 채택안 | 이유 |
|:---:|---|---|---|
| **A** | 콘텐츠 테이블 구조 | **단일 `contents` + `youtube_videos`·`ai_reports` 별도** | 뉴스/리포트/오피니언/뉴스레터는 컬럼이 거의 동일 → 단일화로 피드·검색·중복필터를 한 테이블에서 처리. 영상 메타(재생시간·채널)와 사용자 생성 보고서는 구조가 달라 분리 |
| **B** | 카테고리 표현 | **`content_category` enum 8개** | PRD에 "카테고리 추가" 관리 기능 없음 → 고정값. enum이 단순·빠름 |
| **C** | 콘텐츠↔서비스 매핑명 | **`content_services`** | 기존 `user_services` 와 명명 일관성 |
| D | 소스 카탈로그 | `sources` + `source_type` enum 5개 | 크롤링 파이프라인(#3·#4)이 출처별 주기·RSS·마지막 수집시각을 추적해야 함 |
| E | 키워드 | `keywords` + `content_keywords` 정규화 | 트렌드 보드(#7) 키워드 버블·추이 집계를 위해 별도 카탈로그 필요 |
| F | 본문 저장 | `body_original` + `body_translated_ko` + `summary_ko` 3컬럼 | 영문 번역 토글 UI(#18)·요약 노출 대비. 단순 컬럼으로 충분 |
| G | 파일 첨부 | `contents.file_path` 단일 컬럼 | 리포트 1:1 첨부 가정. Supabase Storage 경로 저장 |
| H | 중복 필터링 메타 | `original_url` 부분 UNIQUE + `title_hash` + `body_hash` | 작업 #12 의 3단계 필터를 DB 레벨에서 지원 |
| I | 임팩트 지표 | `view_count`·`bookmark_count`·`is_editor_pick`·`published_at` | UX 로드맵의 인기/에디터픽/최신 정렬 미리 대비 |
| J | AI 보고서 참조 | `ai_report_sources` junction | 보고서가 어떤 콘텐츠를 근거로 했는지 정규화 |
| K | 북마크 vs 아카이브 | `bookmarks`(단순) + `archives`/`archive_items`(컬렉션) | 즐겨찾기와 메일 발송용 컬렉션은 의미가 달라 분리 |

---

## 3. 검토가 필요한 설계 포인트 (수희 의견 요청)

### 3.1 다형 참조 — `content_id` / `youtube_video_id` nullable FK + CHECK

`bookmarks`·`archive_items`·`ai_report_sources` 는 **콘텐츠(`contents`)와 유튜브(`youtube_videos`) 둘 다** 가리킬 수 있어야 합니다. 결정 A로 두 테이블이 분리됐기 때문입니다.

두 가지 방식 중 **FK 컬럼 분리 + CHECK 제약**을 택했습니다:

```sql
content_id       uuid references public.contents (id) on delete cascade,
youtube_video_id uuid references public.youtube_videos (id) on delete cascade,
constraint ..._one_item check (
  (content_id is not null)::int + (youtube_video_id is not null)::int = 1
)
```

- ✅ **장점**: FK 무결성 유지(삭제 시 cascade 자동 정리), 정확히 하나만 채워지도록 강제
- ❌ **대안(폴리모픽 `item_type`+`item_id`)**: 컬럼은 적지만 FK가 없어 고아 레코드 위험
- 🔎 **검토 요청**: 향후 AI 보고서나 외부 링크도 북마크 대상이 되면 컬럼이 계속 늘어남. 지금 범위(콘텐츠+유튜브)에선 이 방식이 안전하다고 판단했는데, 동의하시는지?

### 3.2 `bookmark_count` 동기화 트리거

`contents.bookmark_count` 는 정렬·인기 표시용 비정규화 컬럼입니다. `bookmarks` INSERT/DELETE 시 트리거(`sync_content_bookmark_count`)로 자동 증감합니다(유튜브 북마크는 카운트 제외).

- 🔎 **검토 요청**: 트리거 대신 조회 시 `count(*)` 집계로 갈지. 북마크가 많아지면 트리거 쪽이 읽기 성능에 유리하다고 봤습니다.

### 3.3 콘텐츠 공개 정책

`contents` SELECT 정책은 `auth.role() = 'authenticated' and is_published` — 미발행 콘텐츠는 일반 사용자에게 숨기고 admin만 전체 조회합니다. 초안 저장 워크플로가 없다면 `is_published` 조건을 빼도 됩니다.

### 3.4 enum 값 확정 필요

- `ai_report_type`(5): `시장동향`·`경쟁사분석`·`키워드분석`·`서비스리포트`·`자유주제` — **잠정값**. 실제 보고서 메뉴 확정 시 조정 필요(enum 값 추가는 쉽지만 삭제는 어려움).
- `source_type`(5): `news_site`·`report_publisher`·`opinion_channel`·`newsletter`·`youtube_channel`.

---

## 4. RLS 정책 요약

기존 컨벤션 그대로:

- **공개 카탈로그·콘텐츠** (`sources`/`keywords`/`contents`/`content_services`/`content_keywords`/`youtube_videos`): 인증 사용자 SELECT + admin 전체 관리. 크롤러는 `service_role` 키로 RLS 우회 적재.
- **본인 데이터** (`ai_reports`/`bookmarks`/`archives`): `auth.uid() = user_id` 패턴 + admin 전체 조회.
- **junction** (`archive_items`/`ai_report_sources`): 소속 부모(아카이브/보고서)의 소유권을 `exists(...)` 로 판정.

전 테이블 `enable row level security` 적용 완료(AGENTS §7 준수).

---

## 5. 검증 결과

| 항목 | 결과 |
|---|---|
| libpg_query 전체 파싱 | ✅ 116개 구문, 오류 0 |
| 신규 테이블 | ✅ 11개 (총 15개) |
| 신규 enum | ✅ 4개 (총 7개) |
| RLS 정책 | ✅ 44개 (전 신규 테이블 커버) |
| 트리거 | ✅ updated_at 5 + bookmark_count 2 |
| ER 다이어그램 mermaid 파싱 | ✅ 통과 |

---

## 6. 적용·핸드오프 절차

1. **수희 검토 미팅** — 본 문서 + ER 다이어그램으로 위 3장 포인트 합의 (작업계획서상 #1·#2 동시 검토 권장).
2. **Supabase 적용** — 합의 후 수희가 SQL Editor에서 `schema.sql` 의 신규 섹션 실행 (⚠️ Phase 1-B lag 지점).
3. **TypeScript 타입 동기화 (Sonnet #11)** — `src/lib/types.ts` 에 신규 enum·테이블 타입 추가 (AGENTS §8 "enum 추가 시 types.ts 동시 수정").
4. **시드 데이터** — `sources`(초기 크롤링 출처)·`keywords`(서비스별 초기 키워드)는 후속 PR에서 `schema.sql` 시드 블록에 추가.

---

## 7. 검토 체크리스트 (수희)

- [ ] 다형 참조 방식(FK 분리 + CHECK) 동의 — §3.1
- [ ] `bookmark_count` 트리거 방식 동의 — §3.2
- [ ] `contents.is_published` 게이팅 유지 여부 — §3.3
- [ ] `ai_report_type` / `source_type` enum 값 확정 — §3.4
- [ ] `keywords.service_id` nullable(키워드를 서비스에 강결합하지 않음) 동의
- [ ] Supabase 적용 시점 합의
