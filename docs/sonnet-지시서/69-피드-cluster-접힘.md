# 지시서 69 — 피드 cluster 접힘 (같은 사건 다매체 → 대표 1건 + "+N개 매체")

> 작성: Opus(Cowork) · 대상: 구현 에이전트(Claude Code) · 검증: Opus · 커밋: 구현 에이전트
> ⚠️ 작업 전 `AGENTS.md` + `src/app/dashboard/contents/page.tsx`(피드 쿼리·ContentItem·렌더) + `src/components/dashboard/ContentCard.tsx`·`ContentRow.tsx`(카드/행 렌더) + `src/lib/crawler/orchestrator.ts`(cluster_id 부여 로직: 대표는 id==cluster_id, 멤버는 cluster_id=대표id, 단독은 null) 를 읽을 것. `npm install` 먼저.
> **DB 변경 없음**(기존 `cluster_id`·`importance_score` 컬럼 사용). 단독 커밋 가능. (지시서 67의 클러스터링 데이터를 화면에 반영하는 마무리.)

---

## 배경
지시서 67 로 같은 사건의 다매체 기사가 동일 `cluster_id` 로 묶이지만, **피드(`/dashboard/contents`)가 cluster 를 접지 않아** 여전히 중복 카드(예: 네이블 5G 특화망 3건)가 그대로 노출된다. 이를 **대표 1건만 카드로 보이고 나머지는 "+N개 매체"로 접는다**.

> 이것은 **중복 접기**(같은 사건)이지 관련기사 추천(다른 사건·비슷한 주제, 묶음 D)이 아니다.

### cluster_id 구조 (orchestrator)
- 단독 기사: `cluster_id = null`.
- 그룹: 대표 행 `cluster_id = 자기 id`, 멤버 행 `cluster_id = 대표 id`.
- ∴ **클러스터 키 = `cluster_id ?? id`**. 같은 키를 가진 행들이 한 사건.

### 설계 결정(David 확정)
- **대표 선정 = `importance_score` 최고**(동률이면 `published_at` 최신). 대표 카드만 노출.
- 접힘 배지 = **"+N개 매체"**(N = 추가 멤버 수). 펼치면 각 멤버의 **출처명 + 원문 링크** 목록.
- 피드가 **client 페이지네이션("더 보기")** 이므로 **client-side 그룹핑**(누적 items 전체 기준). 신규 SQL/RPC 없이.

## 작업

### 1. 쿼리·타입에 필드 추가
- `page.tsx` 메인 contents select 에 **`cluster_id, importance_score`** 추가.
- `ContentItem` 인터페이스에 `cluster_id: string | null`, `importance_score: number` 추가.

### 2. 그룹핑 헬퍼 (누적 items → 표시용 클러스터)
- `items`(누적, published_at desc)로부터 표시 목록 산출:
  - `clusterKey = item.cluster_id ?? item.id` 로 그룹.
  - 각 그룹: **대표 = importance_score 최고(동률 published_at 최신)**, `members = 나머지`(출처명·original_url·title 보유), `memberCount = members.length`.
  - 표시 순서: 각 그룹을 **대표의 원래 피드 위치(published_at desc)** 기준으로 정렬해 기존 최신순 흐름 유지.
  - useMemo 로 `items` 변화 시 재계산(React 19 — 꼭 필요 시에만 useMemo, 여기선 파생 계산이라 적절).
- 단독(멤버 0)은 그대로 1장.

### 3. 카드/행 UI — "+N개 매체"
- `ContentCard`/`ContentRow` 에 옵셔널 prop `clusterMembers?: { name: string; url: string | null; title: string }[]` (또는 `memberCount` + 목록) 추가.
- `memberCount > 0` 이면 대표 카드에 **"+N개 매체"** 배지(작게, muted/secondary 톤). 클릭/호버 시 **펼침**: 멤버별 `출처명 — 원문 보기(링크)` 목록(팝오버 또는 인라인 토글, 기존 출처 팝오버 패턴 있으면 재사용).
- 링크 안전: 원문은 `target="_blank" rel="noopener noreferrer"`(기존 카드 패턴 동일).
- card view·list view 둘 다 적용(둘 다 있으면). 없으면 카드만.

### 4. 카운트/페이지네이션
- `total`(서버 count)·"더 보기"는 **원시 행 기준 유지**(접힘은 표시 한정). 접힘으로 한 페이지에 카드가 20개보다 적게 보일 수 있음 — 정상(보고에 명시).
- 클러스터가 페이지 경계를 걸치면, 다음 페이지 멤버가 로드될 때 기존 대표의 memberCount 가 증가(누적 그룹핑이라 자동). 새 카드로 안 뜸.

## 회귀 / 주의
- DB 무변경. 어드민(`/admin/contents`)은 전수 표시 유지(변경 없음).
- 표시 한정 — 데이터·상태·필터·검색 동작 불변. 필터(카테고리/출처/서비스/날짜) 적용 후의 items 에 대해 그룹핑.
- 대표가 페이지 누적에 따라 바뀌면 카드가 살짝 재정렬될 수 있음(같은 사건은 발행시각 근접이라 영향 작음). 거슬리면 대표 기준을 "최신 고정"으로 바꿀 수 있음(상수/주석).
- RecentFeed(대시보드 홈)·검색 결과의 동일 접힘은 **후속**(이번은 `/dashboard/contents` 우선). 보고에 명시.
- UI 텍스트 한국어(#1), 색상 토큰/secondary·muted(#9), `cn()`.

## 완료 조건
- [ ] 쿼리·ContentItem 에 cluster_id·importance_score 추가
- [ ] client-side 그룹핑(clusterKey=cluster_id??id, 대표=importance 최고/최신, memberCount·members)
- [ ] 카드/행 "+N개 매체" 배지 + 펼침(멤버 출처·원문 링크)
- [ ] total·더보기 원시행 유지(접힘은 표시)
- [ ] `npx tsc --noEmit` · `npm run build` · `npm run lint`(신규 0) 통과
- [ ] 육안: 같은 사건 3건이 1장(+2개 매체)으로 접힘, 펼치면 다른 매체 링크 노출

## 보고 양식
```
## 완료 보고 — 지시서 69 피드 cluster 접힘
- 변경 파일: <목록>
- cluster_id·importance_score 조회 / client 그룹핑(대표 importance 최고) / "+N개 매체" 배지·펼침
- 어드민 전수표시·필터·더보기 불변 · DB 무변경
- 검증: tsc · build · lint(신규 0)
- 미해결: RecentFeed·검색 동일 접힘(후속), 서버측 정확 dedup(RPC, 선택)
```

---

### 메모(후속)
- 정확한 서버측 cluster 1건/페이지(페이지 경계 무관)는 RPC(distinct-on cluster) 필요 → 신규 SQL, 후속.
- RecentFeed·검색·아카이브 동일 접힘 적용 후속.
- 관련: [[insight-out-뉴스수집-개선-로드맵]]
