# 지시서 422 — MCP 뉴스레터 read 도구

> 작성: 플래너(Opus) · 2026-07-24 · Teams 봇 "뉴스레터 정기 푸시"(VDI-Teams봇 설계 B)
> 근거: `newsletter_issues` 스키마 + `dispatch.ts`(status 흐름) · 421 read-analytics 패턴
> 협업 루프: 검증용 브랜치 `agent/422-mcp-newsletter-read`(from `origin/main`) → 재현검증 → "커밋해" → 머지.
> 번호: 422 · git author David(yjhead@gmail.com) · **SQL 0.**

---

## 0. 한 줄
사내 에이전트가 **발송된 뉴스레터**(제목·날짜·수록 기사·본문 카드)를 읽도록 `newsletter_list`·`newsletter_get` read 도구를 추가한다. **발송분만**, 수신자 PII는 절대 안 건드린다.

---

## 1. 착수 전 확인 (origin/main)
- 테이블 `newsletter_issues`: `id, sent_on(date), subject, content_ids(uuid[]), recipient_cnt, status, triggered_by, created_at, payload(jsonb)`.
- **상태 흐름**(`dispatch.ts`): 생성 시 `status='pending'` → 발송 후 `'sent'`(전건 성공)·`'partial'`(일부)·`'failed'`(전건 실패). `payload`에 **발송된 카드·티저 내용** 저장(감사·재사용용).
- ⚠️ **수신자 PII는 별도 테이블** `newsletter_recipients`(이메일·오픈여부) — **이번 도구는 이 테이블을 조회하지 않는다.**
- 421 `src/lib/mcp/tools/read-analytics.ts` 패턴(guard→admin client→발행필터 직접→text 출력) 그대로 복제.

## 2. 구현 (`read-analytics.ts` 에 도구 2개 추가)

**`newsletter_list` — 발송 뉴스레터 목록**
- 게이트: **`.in('status', ['sent','partial'])`** (pending·failed 제외). `.order('sent_on', desc)`.
- inputSchema: `limit`(≤50, 기본 20).
- 출력: id, sent_on, subject, recipient_cnt(발송 규모, 집계값이라 노출 가능).

**`newsletter_get` — 뉴스레터 상세(본문)**
- inputSchema: `id`(uuid).
- 게이트: `.eq('id', id).in('status', ['sent','partial']).maybeSingle()` — 미발송이면 "발송되지 않은 뉴스레터" 반려.
- 출력: subject, sent_on, content_ids(→ `content_get`으로 개별 기사 연결 가능함을 description에 안내), **payload**(카드·티저 본문). payload는 발송된 내용 그대로라 노출 안전.

- 공통: `guard(extra)`→`read` 스코프, `createAdminClient()`, text 출력(`ok`/`dbError`).

## 3. 하지 말 것
- **`newsletter_recipients` 조회 금지**(수신자 이메일·오픈율 = PII).
- `status='pending'/'failed'` 노출 금지(미발송·실패분).
- `triggered_by` 등 내부 필드 노출 불필요(생략).
- 새 스코프 만들지 않기(`read`). write/발송 로직 무관.
- 다른 도구·인증 로직 무수정.

## 4. 회귀 가드
1. `newsletter_list`가 **발송분(sent/partial)만** 최신순 반환.
2. `newsletter_get`이 본문(payload)·제목·수록 기사 id 반환, 미발송 id엔 반려.
3. 수신자 PII(이메일 등) 응답에 없음.
4. read 스코프로 호출 가능, 스코프 없으면 forbidden.
5. 기존 421·read 도구 무영향.

## 5. 검증
```bash
npx tsc --noEmit && npm run lint && npm run build
grep -n "newsletter_list\|newsletter_get\|'sent'\|'partial'" src/lib/mcp/tools/read-analytics.ts
grep -n "newsletter_recipients" src/lib/mcp/tools/read-analytics.ts && echo "⚠️ 수신자 테이블 조회 — 제거" || echo "OK: 수신자 PII 미조회"
# 전체 도구명 중복 없어야
for f in read read-analytics ops reports; do git show HEAD:src/lib/mcp/tools/$f.ts 2>/dev/null | grep -oP "registerTool\(\s*'\K[a-z_]+"; done | sort | uniq -d
git diff --stat origin/main
```
**라이브(토큰)**
- [ ] newsletter_list → 발송분 목록
- [ ] newsletter_get → 본문, 미발송 반려
- [ ] 수신자 정보 없음

## 6. 커밋
브랜치 `agent/422-mcp-newsletter-read` → 커밋·푸시 → 재현검증 → "커밋해" → 머지.
스테이징: `src/lib/mcp/tools/read-analytics.ts` · 이 지시서
제외: 상시 목록(topic-covers NFD·council-bridge·성능-리전이동·골드샘플).
커밋: `feat: MCP 뉴스레터 read 도구(newsletter_list·newsletter_get) (422)`

### 기록란 (구현자)
| 항목 | 결과 |
|---|---|
| 발송 게이트(sent/partial)·미발송 반려 | |
| newsletter_recipients 미조회(PII) | |
| 도구명 중복 없음 | |

## 7. 다음
- 423 아카이브 write+list(별도 write 스코프) · 424 보고서 생성 트리거.
- Teams 봇: PA 스케줄 플로가 newsletter_list/get → Teams 채널·메일 푸시(David).
