# MCP 연결 — 각자의 Claude에서 인사이트 아웃에 기록하기

> 지시서 190. 팀원 각자가 자기 Claude(Code / Desktop / Cowork)에서 인사이트 아웃에 직접 기록한다.
> 별도 배포 없이 Next 앱 안(`/api/mcp`)에서 동작.
>
> **MCP의 두 가지 주 용도**
> 1. **운영 게시판 기록** — 진행현황, 작업계획 공유, 작업 루틴·기술 스택 등 팀 정의 문서
> 2. **전략보고서 생성** — 수집된 콘텐츠를 근거로 보고서 작성
>
> (+ 위 둘을 제대로 하기 위한 **조회·검색** 툴)
>
> **188 → 190 변경 요약**: 팀 공용 단일 토큰 → **팀원 1인 1토큰**.
> 이유는 아래 "왜 공용 토큰이면 안 되나" 참고.

---

## 1. 팀원 온보딩 (3단계)

### ① 토큰 발급받기

어드민에게 요청 → 어드민이 **`/admin/mcp`** 에서 발급 → 안전한 경로(1:1 DM 등)로 전달받는다.

> 토큰은 **발급 직후 화면에 딱 한 번만** 표시된다. DB에는 해시만 남아 어드민도 다시 볼 수 없다.
> 잃어버리면 재발급이 유일한 방법이다.

### ② Claude에 연결

**Claude Code** — 프로젝트 루트에 `.mcp.json`:

```json
{
  "mcpServers": {
    "insight-out": {
      "type": "http",
      "url": "https://insight-out-app.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer io_여기에_발급받은_토큰"
      }
    }
  }
}
```

> ⚠️ `.mcp.json` 에 토큰을 넣고 **커밋하지 마세요**(공개 repo). `.gitignore` 에 추가하거나
> 환경변수 참조(`"Bearer ${INSIGHT_OUT_MCP_TOKEN}"`)를 쓰세요.

**Claude Desktop / Cowork** — 설정 > 커넥터 > 커스텀 커넥터에 같은 URL·헤더를 등록.

### ③ 확인

Claude에게 "인사이트 아웃 운영 게시판에서 진행 중인 작업 보여줘" 라고 하면
`ops_list` 툴이 호출된다. 401이 뜨면 토큰이 잘못됐거나 폐기된 것.

---

## 2. 권한(스코프)

토큰마다 권한이 다르다. 어드민이 발급 시 선택한다.

| 스코프 | 뜻 |
|---|---|
| `read` | 콘텐츠·이슈·기업 검색/조회 — **보고서의 근거를 찾는 데 필수** |
| `ops` | 운영 게시판 — 작업계획/결과, 요청·공지 등록·수정 |
| `reports` | 전략보고서 초안 작성·수정 |
| `publish` | **검토 없이 서비스에 즉시 노출** — 신중히 부여 |

### 발행 게이트 (중요)

**`publish` 스코프가 없으면 전략보고서는 미발행 초안(`published_at = null`)으로만 저장된다.**
즉 사용자 화면에 뜨지 않는다. 에이전트가 실수로 사용자에게 글을 노출하는 사고를 **구조적으로** 막는다.

평소엔 `publish` 없이 쓰고, 초안을 어드민(`/admin/reports`)에서 검토 후 발행하는 흐름을 권장한다.
`publish` 가 있으면 `report_create(publish: true)` 로 즉시 발행할 수 있다.

> 운영 게시판(`ops`)은 팀 내부용이라 발행 게이트가 없다.

---

## 3. 제공 툴

### 읽기 (`read`)

| 툴 | 설명 |
|---|---|
| `content_search` | 수집된 콘텐츠 검색. **글 쓰기 전에 항상 먼저 호출** — 반환된 `id` 를 인용 근거로 쓴다. |
| `content_get` | 콘텐츠 1건의 전체 본문(요약·원문·번역·유튜브 자막). |
| `issue_list` | 큐레이션된 이슈(주제 클러스터) 목록. |
| `entity_list` | 추적 중인 기업/기관. `competitor_only` 로 경쟁사만. |

### 운영 게시판 (`ops`) — 주 용도 ①

| 툴 | 설명 |
|---|---|
| `ops_list` | 작업(`work`)·요청(`request`)·공지(`announcement`) 목록. |
| `ops_get` | 1건 전체 본문 — **누적된 진행 메모를 읽으려면 이 툴**. |
| `ops_create` | 등록. 작업계획은 `phase`(단계)·`seq`(순번)로 묶는다. |
| `ops_update` | 상태·담당 갱신, `note` 로 진행 메모를 본문에 누적. |

- `status` (작업·요청): `pending` · `in_progress` · `done` · `blocked`
- `status` (공지): `active` · `archived`
- `kind`: `sql` · `infra` · `config` · `question` · `share` · `other`
- **삭제 툴은 없다** — 종료는 `done`(작업·요청) / `archived`(공지) 로 상태 전환.

**용도별 쓰는 법**

| 기록하려는 것 | post_type | 비고 |
|---|---|---|
| 작업계획 / 진행현황 / 결과 | `work` | `phase`+`seq` 로 단계별 묶기. 진행 메모는 `ops_update(note:)` 로 누적 |
| 작업 루틴 · 기술 스택 등 팀 정의 문서 | `announcement` | `pinned: true` 로 상단 고정. `kind: 'share'` |
| SQL·인프라·설정 요청 | `request` | `kind` 로 종류 구분 |

### 전략보고서 (`reports`) — 주 용도 ②

| 툴 | 설명 |
|---|---|
| `report_create` | 보고서 저장. `source_content_ids` 로 근거 콘텐츠를 연결한다. |
| `report_update` | 수정. **본인이 쓴 보고서만** (어드민 제외). |
| `report_list` | 목록. 기본은 내가 쓴 것만. |

> **인사이트 기록 툴은 현재 없다.** `key_insights` 주간 파이프라인이 폐기(9e10230)되며
> 이를 읽는 화면이 0개가 됐다. 그 상태로 툴을 두면 카드를 써도 아무도 볼 수 없어
> — 에러 없이 조용히 사라진다 — 지면을 정할 때까지 뺐다.

---

## 4. 좋은 사용 패턴

```
❌ "AI 시장동향 보고서 써줘"
   → Claude가 자기 사전지식으로 씀. 인사이트 아웃 데이터와 무관한 글.

✅ "인사이트 아웃에서 최근 2주 AI 관련 콘텐츠 찾아서, 그걸 근거로 시장동향 보고서 초안 써줘"
   → content_search → content_get → report_create(source_content_ids=[...])
   → 출처가 연결된 초안이 저장됨. 어드민에서 검토 후 발행.
```

읽기 툴 없이 쓰기만 시키면 **근거 없는 글**이 쌓인다. 항상 검색부터.

---

## 5. 왜 공용 토큰이면 안 되나

> "팀 공용 토큰 하나 쓰고, 작성자는 파라미터로 넘기면 되지 않나?"

`users` 테이블은 이미 있다. 문제는 테이블이 아니라 **서버가 어느 행인지 확신할 수 있느냐**다.

1. **이미 해봤고 이미 깨졌다.** 188의 `created_by` 가 정확히 자유 문자열 파라미터였다.
   그 결과가 구 문서의 *"작성자(Opus, Sonnet, David 등)"* — 사람과 모델명이 섞여 들어갔다.
   LLM이 채우는 자유 문자열은 빠뜨리거나 지어낸다. 사칭 이전에 **신뢰할 수 없다**.

2. **`ai_reports.user_id` 는 uuid FK(NOT NULL)** 다. 이름 문자열로는 애초에 저장이 안 된다.
   공용 토큰을 쓰더라도 팀원 각자의 Claude가 **자기 uuid를 알아야** 한다
   → 사람마다 설정에 뭔가를 넣어야 하는 건 **어차피 똑같다**.

3. 설정 부담이 같다면 남는 건 얻는 것의 차이다.
   - uuid 파라미터 → 폐기 불가, 권한 분리 불가, 사칭 가능, 감사 무의미
   - **개인 토큰 → 폐기·권한(publish 분리)·감사가 전부 따라옴**

4. 공용 토큰은 **1명 유출 = 전원 교체**.

---

## 6. 동작 원리 · 전제 조건

- **전송**: Streamable HTTP (무상태 — 세션/Redis 불필요)
- **인증**: `Authorization: Bearer <토큰>`. `mcp_tokens` 에서 **sha256 해시로 조회**
  (평문 미저장). 폐기(`revoked_at`)·만료(`expires_at`) 확인. 실패 시 401.
- **DB 접근**: 서버 전용 `createAdminClient()`(service_role). RLS를 우회하므로
  모든 쓰기는 `mcp_audit_log` 에 **누가·어떤 툴로·무엇을** 남긴다.
- **에러**: 실패는 MCP 프로토콜의 `isError: true` 로 반환한다
  (평문 텍스트로 돌려주면 호출하는 LLM이 정상 데이터로 착각한다 — 188의 실제 버그).

### 전제 조건

1. **SQL 적용**: `docs/sql-handoff/190-mcp-tokens.sql` 을 Supabase에 실행
   (`mcp_tokens`, `mcp_audit_log`, `ops_requests.phase/seq`).
2. 187 SQL(`docs/sql-handoff/187-ops_requests.sql`)이 적용돼 있을 것.
3. **`MCP_TOKEN` 환경변수는 더 이상 쓰지 않는다** — Vercel에서 제거해도 된다.
