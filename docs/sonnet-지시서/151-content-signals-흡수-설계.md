# 지시서(설계) — content_signals 흡수: 이슈↔시그널↔콘텐츠 근거 레이어 (2026-06-27)

**작성**: Cowork Opus (데이터 모델 설계)
**대상**: 코드 (Claude Code) — Step 0 스키마 확정은 Opus/David와 함께
**레포**: `/Users/jangsydney/insight-out` (shjang9714-art/insight-out)
**배치 위치(GitHub)**: `docs/sonnet-지시서/` (번호는 머지 시 부여)
**연계**: `지시서_20260627_화면개편-IA재편-5탭.md` 의 [O] 항목 — AI 인사이트(이슈→근거 드릴다운·논조 분포)·기업동향(기업별 시그널 묶음)·콘텐츠(사업기회 클래스)의 **공통 기반층**

> ⚠️ **작업 시작 전 필수**: `AGENTS.md` 먼저 읽고 규칙 준수.
> ⚠️ **이 설계는 라이브 스키마 확정 전까지 "가설"이다.** 레포 SQL이 아니라 **실제 DB 스키마와 직접 대조**해 Step 0에서 확정한 뒤 Step 1+로 진행할 것 ([[feedback-db-schema-vs-code]] — #54 번역 0건 사건 교훈).
> ⚠️ 신규 테이블/뷰/컬럼은 `supabase/` SQL + **anon·authenticated GRANT 필수**(2026-05-30 이후 Data API 기본 비노출).

---

## 0. 목표

이미 적재된 `content_signals`(약 1,159건)를 **이슈와 콘텐츠를 잇는 근거(evidence) 레이어**로 연결한다. 이 레이어 하나로 다음이 동시에 풀린다:
- AI 인사이트: **이슈 → 근거 콘텐츠 드릴다운**, **논조 분포 추이**
- 기업동향: **기업(엔티티)별 이슈/시그널 묶음**
- 콘텐츠: **"사업기회" 시그널 클래스** 확장의 토대

목표 관계도(논리):

```
issue (이슈)  ─< issue_signals >─  content_signal  ─→  content (원문)
                                        │
                                        ├─ signal_type (분류: 일반/사업기회/…)
                                        ├─ sentiment   (논조: 긍/중/부)
                                        └─ entity_ref  (엔티티 연결, 선택)
```

---

## 1. Step 0 — 라이브 스키마 확정 (선행, 차단 단계)

UI/마이그레이션 작성 전에 **반드시** 아래를 실측하고 결과를 보고에 첨부. (Supabase SQL Editor)

```sql
-- 1) content_signals 컬럼·타입
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='content_signals'
order by ordinal_position;

-- 2) FK / 인덱스 (무엇에 연결돼 있나)
select tc.constraint_type, kcu.column_name, ccu.table_name as ref_table, ccu.column_name as ref_col
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu on tc.constraint_name=kcu.constraint_name
left join information_schema.constraint_column_usage ccu on tc.constraint_name=ccu.constraint_name
where tc.table_name='content_signals';

-- 3) 실데이터 형태 파악
select count(*) from content_signals;
select * from content_signals order by created_at desc nulls last limit 20;

-- 4) 이슈 테이블/이슈-콘텐츠 연결 현황 확인 (이름 추정: issues / issue_contents 등 grep)
select table_name from information_schema.tables
where table_schema='public' and (table_name ilike '%issue%' or table_name ilike '%signal%');
```

### Step 0 산출(확정해야 할 질문)
1. `content_signals`가 **이미 `content_id`(원문 FK)를 갖는가?** → 가지면 시그널↔콘텐츠는 완료, **이슈 연결만** 신규.
2. 시그널에 **논조(sentiment) 컬럼이 있는가?** 없으면 논조 분포는 별도 채움 경로 필요.
3. 시그널에 **분류(type/class) 컬럼이 있는가?** "사업기회" 확장 시 enum 추가 vs 신규 컬럼 결정.
4. **이슈↔콘텐츠 연결이 이미 존재하는가?**(이슈 상세가 근거 콘텐츠를 어떻게 찾는지) → 있으면 시그널을 그 경로에 끼워넣고, 없으면 `issue_signals`로 신설.

> 아래 Step 1~4는 위 4개 답에 따라 분기. **분기 지점마다 어느 쪽을 택했는지 보고에 명시.**

---

## 2. Step 1 — 연결 모델 (마이그레이션)

### Case A. `content_signals.content_id` 가 이미 있음 (가장 가능성 높음)
이슈 연결만 추가한다.

```sql
-- 이슈 ↔ 시그널 N:M (한 시그널이 여러 이슈 근거가 될 수 있음)
create table if not exists public.issue_signals (
  issue_id   uuid not null references public.issues(id) on delete cascade,
  signal_id  uuid not null references public.content_signals(id) on delete cascade,
  relevance  numeric,             -- 근거 강도(선택)
  created_at timestamptz default now(),
  primary key (issue_id, signal_id)
);
create index if not exists idx_issue_signals_issue on public.issue_signals(issue_id);
create index if not exists idx_issue_signals_signal on public.issue_signals(signal_id);

-- ★ GRANT 필수
grant select, insert, update, delete on public.issue_signals to authenticated;
grant select on public.issue_signals to anon;
```

### Case B. `content_signals` 에 `content_id` 가 없음
시그널↔콘텐츠 연결부터 보강(컬럼 추가 또는 매핑 테이블). Step 0 결과로 어느 쪽인지 확정 후 Opus와 협의.

### 채움(backfill)
- 이슈 생성/갱신 파이프라인에서 `issue_signals` upsert. 기존 이슈는 소급 백필 SQL 별도(`supabase/2026-06-XX-issue-signals-backfill.sql`).
- 멱등성: `on conflict do nothing`(복합 PK). [[deploy-verification]] 백필 검증 절차 준용(건수 before/after, distinct 확인).

---

## 3. Step 2 — 읽기 뷰 / API

### 3-1. 이슈 → 근거 콘텐츠 드릴다운
- 뷰 또는 쿼리: `issue_id` → `issue_signals` → `content_signals` → `contents`(원문). 정렬 relevance desc.
- API: `GET /api/issues/{id}/evidence` (또는 기존 이슈 상세 로더 확장). 반환: 시그널 요지 + 원문 카드(제목/소스/날짜/논조/링크).
- ★ 신규 뷰 만들면 GRANT 필수.

### 3-2. 논조 분포 추이
- Step 0에서 **sentiment 위치 확정 후**:
  - 시그널에 sentiment가 있으면 `issue_signals`+`content_signals` 집계.
  - 없으면 콘텐츠/이슈 단의 논조 소스 사용(별도 결정).
- 집계 뷰 예: `issue_id, bucket(week), sentiment, count`. API `GET /api/issues/{id}/sentiment-trend` 또는 전체 추이.

### 3-3. 기업(엔티티)별 시그널 묶음 (기업동향 탭 연계)
- 시그널의 entity 연결 여부 Step 0에서 확인. 있으면 `entity_id`로 그룹, 없으면 후속 [O] 엔티티 모델과 합류.

---

## 4. Step 3 — UI 연결 (Claude Code [S])

> 데이터(Step 1~2)가 검증된 뒤 착수. UI 자체는 Sonnet 단독 가능.

1. **이슈 상세(`/dashboard/issues/{id}`)**: 하단에 "근거 콘텐츠" 섹션 — `evidence` API 결과를 원문 카드 리스트로. 카드에 논조 배지.
2. **AI 인사이트(`/dashboard/issues`)**: "논조 분포 추이" 차트 위젯(기간 토글).
3. **콘텐츠/기업동향**: 이번 차수 범위 외(기반층만 깔고, 사업기회 클래스·엔티티 묶음은 후속 [O]).

---

## 5. Step 4 — "사업기회" 클래스 확장 토대 (이번 차수는 토대만)
- Step 0의 분류 컬럼 결과에 따라: `signal_type` enum에 `business_opportunity` 추가 **또는** 신규 컬럼/태그.
- 사업기회 전용 메타(마감일·발주처·금액)는 **별도 차수**(나라장터/조달청 소싱 지시서)에서 컬럼 추가 + GRANT. 이번 지시서는 enum/타입 자리만 확보.

---

## 6. 실행 순서 & 완료 기준
1. **Step 0 스키마 실측** → 4개 분기 질문 답 보고. (여기서 멈추고 Opus 확인 받기)
2. Step 1 마이그레이션(분기 확정본) + GRANT + 백필.
3. Step 2 뷰/API + GRANT.
4. Step 3 UI(이슈 근거 드릴다운 → 논조 분포).
5. 커밋·push·배포 → `/api/version` 갱신 확인.

### 검증 체크리스트
- [ ] Step 0 실측 결과(컬럼·FK·건수·샘플) 보고 첨부
- [ ] `issue_signals`(또는 대체) 생성 + **anon·authenticated GRANT** 확인
- [ ] 백필 후 건수 before/after + distinct 검증
- [ ] 이슈 상세에서 근거 콘텐츠 실제 노출(0건 아님 — 라이브 1건 이상 end-to-end)
- [ ] 논조 분포 위젯 데이터 정합
- [ ] 신규 뷰/테이블 Data API 노출 확인(비노출 사고 방지)

> ⚠️ 라우트/엔드포인트가 실제 등록됐는지 **빌드 매니페스트로 검증**([[feedback-middleware-guard]] — proxy.ts 죽은 코드 사건 교훈).
