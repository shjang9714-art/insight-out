'use client'

// 190 — MCP 토큰 발급/폐기 보드
// 평문 토큰은 발급 직후 한 번만 보여준다. 화면을 벗어나면 다시 볼 수 없다.

import { useEffect, useState, useCallback } from 'react'
import { KeyRound, Copy, Check, Ban, AlertTriangle } from 'lucide-react'
import { MCP_SCOPES, MCP_SCOPE_LABEL, MCP_SCOPE_DESC, type McpScope } from '@/lib/mcp/scopes'

interface TokenRow {
  id: string
  label: string
  token_prefix: string
  scopes: string[]
  last_used_at: string | null
  expires_at: string | null
  revoked_at: string | null
  created_at: string
  users: { id: string; name: string; email: string } | null
}

interface TeamUser {
  id: string
  name: string
  email: string
}

const DEFAULT_SCOPES: McpScope[] = ['read', 'ops', 'reports', 'insights']

export default function McpTokenBoard() {
  const [tokens, setTokens] = useState<TokenRow[]>([])
  const [users, setUsers] = useState<TeamUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [userId, setUserId] = useState('')
  const [label, setLabel] = useState('')
  const [scopes, setScopes] = useState<McpScope[]>(DEFAULT_SCOPES)
  const [issuing, setIssuing] = useState(false)

  const [freshToken, setFreshToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // 주의: 이 함수는 useEffect 에서도 호출된다. 이펙트 본문에서 동기적으로 setState 를
  // 호출하면 React 19 컴파일러가 연쇄 렌더로 판단해 막는다(react-hooks/set-state-in-effect).
  // 따라서 여기서는 setLoading(true) 를 하지 않고, 초기 state 를 loading=true 로 둔다.
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/mcp-tokens')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '토큰 목록을 불러오지 못했습니다.')

      setTokens(json.tokens ?? [])
      setUsers(json.users ?? [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  // RequestsBoard 와 동일 패턴 — 이펙트 본문에서 동기적으로 setState 하지 않도록
  // 내부 async 함수로 감싼다(react-hooks/set-state-in-effect).
  useEffect(() => {
    const run = async () => { await load() }
    void run()
  }, [load])

  async function issue() {
    if (!userId) { setError('토큰을 발급할 팀원을 선택해주세요.'); return }
    setIssuing(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/mcp-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, label, scopes }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '발급에 실패했습니다.')

      setFreshToken(json.token)
      setLabel('')
      setUserId('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '발급 실패')
    } finally {
      setIssuing(false)
    }
  }

  async function revoke(id: string) {
    if (!confirm('이 토큰을 폐기하시겠습니까? 해당 Claude 연결이 즉시 끊깁니다.')) return
    try {
      const res = await fetch('/api/admin/mcp-tokens', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'revoke' }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? '폐기에 실패했습니다.')
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '폐기 실패')
    }
  }

  function copyToken() {
    if (!freshToken) return
    void navigator.clipboard.writeText(freshToken)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function toggleScope(s: McpScope) {
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* 발급 직후 1회 노출 */}
      {freshToken && (
        <div className="rounded-lg border border-brand-600/30 bg-brand-50/50 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <AlertTriangle className="h-4 w-4 text-brand-600" />
            토큰이 발급되었습니다 — 지금 복사하세요. 이 화면을 벗어나면 다시 볼 수 없습니다.
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded border border-border bg-background px-3 py-2 font-mono text-xs">
              {freshToken}
            </code>
            <button
              onClick={copyToken}
              className="flex shrink-0 items-center gap-1.5 rounded-md bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? '복사됨' : '복사'}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            팀원에게 안전한 경로(1:1 메시지 등)로 전달하세요. Slack 공개 채널·이메일 평문 전송은 피해주세요.
          </p>
          <button
            onClick={() => setFreshToken(null)}
            className="mt-3 text-xs text-muted-foreground underline hover:text-foreground"
          >
            확인했습니다 — 닫기
          </button>
        </div>
      )}

      {/* 발급 폼 */}
      <section className="rounded-lg border border-border p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
          <KeyRound className="h-4 w-4 text-brand-600" />
          새 토큰 발급
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">팀원</label>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">선택하세요</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email} ({u.email})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">용도 메모</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="예: 수희 - 업무용 노트북 Claude Code"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-2 block text-xs font-medium text-muted-foreground">권한(스코프)</label>
          <div className="space-y-2">
            {MCP_SCOPES.map((s) => (
              <label key={s} className="flex cursor-pointer items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={scopes.includes(s)}
                  onChange={() => toggleScope(s)}
                  className="mt-0.5"
                />
                <span>
                  <span className={`font-medium ${s === 'publish' ? 'text-brand-600' : 'text-foreground'}`}>
                    {MCP_SCOPE_LABEL[s]}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">{MCP_SCOPE_DESC[s]}</span>
                </span>
              </label>
            ))}
          </div>
          {scopes.includes('publish') && (
            <p className="mt-2 rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              ⚠️ 즉시 발행 권한입니다. 이 토큰을 쓰는 Claude 는 검토 없이 사용자 화면에 글을 올릴 수 있습니다.
            </p>
          )}
        </div>

        <button
          onClick={issue}
          disabled={issuing || !userId}
          className="mt-5 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {issuing ? '발급 중…' : '토큰 발급'}
        </button>
      </section>

      {/* 발급 목록 */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">발급된 토큰</h2>

        {loading ? (
          <p className="text-sm text-muted-foreground">불러오는 중…</p>
        ) : tokens.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 발급된 토큰이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">팀원</th>
                  <th className="px-4 py-2.5 text-left font-medium">용도</th>
                  <th className="px-4 py-2.5 text-left font-medium">토큰</th>
                  <th className="px-4 py-2.5 text-left font-medium">권한</th>
                  <th className="px-4 py-2.5 text-left font-medium">마지막 사용</th>
                  <th className="px-4 py-2.5 text-left font-medium">상태</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => {
                  const revoked = !!t.revoked_at
                  return (
                    <tr key={t.id} className={`border-b border-border last:border-0 ${revoked ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{t.users?.name || '-'}</div>
                        <div className="text-xs text-muted-foreground">{t.users?.email}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{t.label || '-'}</td>
                      <td className="px-4 py-3">
                        <code className="font-mono text-xs">{t.token_prefix}…</code>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {t.scopes.map((s) => (
                            <span
                              key={s}
                              className={`rounded px-1.5 py-0.5 text-[11px] ${
                                s === 'publish'
                                  ? 'bg-brand-600/10 text-brand-700'
                                  : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {MCP_SCOPE_LABEL[s as McpScope] ?? s}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {t.last_used_at ? t.last_used_at.slice(0, 16).replace('T', ' ') : '미사용'}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {revoked ? (
                          <span className="text-destructive">폐기됨</span>
                        ) : (
                          <span className="text-foreground">유효</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!revoked && (
                          <button
                            onClick={() => revoke(t.id)}
                            className="flex items-center gap-1 text-xs text-destructive hover:underline"
                          >
                            <Ban className="h-3 w-3" />
                            폐기
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
