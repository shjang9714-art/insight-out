# MCP 연결 — 운영 게시판 (`/api/mcp`)

> 지시서 188. 187 운영 게시판(`ops_requests`)을 MCP 툴로 노출한 엔드포인트. 별도 배포 없이 Next 앱 안(`/api/mcp`)에서 동작.

## 연결 정보

- **URL**: `https://insight-out-app.vercel.app/api/mcp`
- **전송**: Streamable HTTP (무상태 — 세션/Redis 불필요)
- **인증**: `Authorization: Bearer <MCP_TOKEN>` 헤더 필수. 토큰이 없거나 틀리면 401.
  - 실제 토큰 값은 이 문서에 적지 않음 — Vercel 환경변수 `MCP_TOKEN` 참고(David/인프라).

## Claude Code / Cowork 설정 예

```json
{
  "mcpServers": {
    "insight-out-ops": {
      "url": "https://insight-out-app.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer <MCP_TOKEN>"
      }
    }
  }
}
```

(설정 파일 형식은 클라이언트마다 다를 수 있음 — 위는 streamable HTTP 원격 서버의 공통 형태.)

## 제공 툴

| 툴 | 설명 |
|---|---|
| `ops_request_list` | 요청/공지 목록 조회. `{ post_type?, status?, owner?, limit? }`. `post_type` 기본 `request`, `status` 미지정 시 요청은 미완료(대기+진행)만 반환. |
| `ops_request_create` | 새 요청 또는 공지 생성. `{ title, body?, kind?, owner?, ref?, post_type?, created_by? }`. |
| `ops_request_update` | 상태·담당·참조·고정 여부 갱신. `{ id, status?, owner?, ref?, pinned?, note? }`. `note`는 본문에 타임스탬프와 함께 append됨. `status='done'` 전환 시 `resolved_at`은 DB 트리거가 자동 기록. |

- `post_type`: `request` | `announcement`
- `status`(요청): `pending` | `in_progress` | `done` | `blocked` — (공지): `active` | `archived`
- `kind`(요청 종류): `sql` | `infra` | `config` | `question` | `share` | `other`

**삭제 툴은 제공하지 않습니다** — 종료 처리는 `status`를 `done`(요청) 또는 `archived`(공지)로 바꾸는 방식입니다.

## 동작 원리

- 인증: `withMcpAuth`로 Bearer 토큰을 `MCP_TOKEN` 환경변수와 비교. `MCP_TOKEN`이 설정돼 있지 않으면 항상 401(안전 기본값 — 비활성).
- DB 접근: 서버 전용 `createAdminClient()`(service_role)로 `ops_requests` 테이블만 read/write. 다른 테이블·기능은 노출하지 않음.
- 테이블 미적용(SQL 핸드오프 전, 오류 코드 `42P01`) 시 각 툴이 안내 메시지를 반환하고 정상 종료(서버 에러 아님).
- 어드민 웹 보드(`/admin/requests`)와 같은 테이블을 공유하므로, MCP로 등록/변경한 내용은 어드민 화면에 즉시 반영됩니다.

## 전제 조건

- Vercel 환경변수 `MCP_TOKEN` 등록(David/인프라). 미등록 시 엔드포인트는 항상 401.
- 187 SQL 핸드오프(`docs/sql-handoff/187-ops_requests.sql`)가 Supabase에 적용돼 있어야 실제 데이터 read/write 가능(미적용 시 graceful 안내만 반환).
