'use client'

import { useEffect, useState } from 'react'
import { Copy, KeyRound, Loader2, ShieldCheck, Trash2 } from 'lucide-react'
import { useAdminConfirm } from '@/components/admin/ui/AdminConfirm'
import AdminSectionHeader from '@/components/admin/ui/AdminSectionHeader'
import AdminTable, { type AdminTableColumn, type AdminTableState } from '@/components/admin/ui/AdminTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { PublicSsoProvider } from '@/lib/admin/sso-admin'
import {
  isSsoNameIdFormat,
  SSO_NAME_ID_FORMATS,
  SSO_NAME_ID_LABEL,
  type SsoNameIdFormat,
} from '@/lib/admin/sso-name-id'

const PROJECT_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '') ?? ''
const SP_VALUES = PROJECT_URL
  ? [
      { key: 'entity', label: 'EntityID', value: `${PROJECT_URL}/auth/v1/sso/saml/metadata` },
      { key: 'acs', label: 'ACS URL', value: `${PROJECT_URL}/auth/v1/sso/saml/acs` },
      { key: 'metadata', label: 'Metadata URL', value: `${PROJECT_URL}/auth/v1/sso/saml/metadata` },
    ] as const
  : []

const ALPHAKEY_METADATA_URL = 'https://lguplus.alphakey.kr/api/sso/admin/v1.0/metadata/info/78'

type Preset = 'alphakey' | 'okta' | 'custom'
type MetadataMode = 'url' | 'xml'

interface ApiErrorBody {
  status?: number
  message?: string
  error?: string
}

function formatKst(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function readApiError(response: Response): Promise<string> {
  let body: ApiErrorBody = {}
  try {
    body = await response.json() as ApiErrorBody
  } catch {
    // JSON 이 아닌 응답이면 HTTP 상태 문구를 그대로 사용한다.
  }
  const status = body.status ?? response.status
  const message = body.message ?? body.error ?? response.statusText
  return `${status} ${message}`.trim()
}

async function fetchProviders(): Promise<PublicSsoProvider[]> {
  const response = await fetch('/api/admin/sso/providers', { cache: 'no-store' })
  if (!response.ok) throw new Error(await readApiError(response))
  const body = await response.json() as { providers?: PublicSsoProvider[] }
  return Array.isArray(body.providers) ? body.providers : []
}

export default function SsoProviderManager() {
  const confirm = useAdminConfirm()
  const [providers, setProviders] = useState<PublicSsoProvider[]>([])
  const [tableState, setTableState] = useState<AdminTableState>('loading')
  const [error, setError] = useState<string | null>(null)
  const [preset, setPreset] = useState<Preset>('alphakey')
  const [metadataMode, setMetadataMode] = useState<MetadataMode>('url')
  const [resourceId, setResourceId] = useState('alphakey')
  const [metadataUrl, setMetadataUrl] = useState(ALPHAKEY_METADATA_URL)
  const [metadataXml, setMetadataXml] = useState('')
  const [domains, setDomains] = useState('')
  const [nameIdFormat, setNameIdFormat] = useState<SsoNameIdFormat | ''>(
    'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
  )
  const [attributeMapping, setAttributeMapping] = useState('')
  const [disabled, setDisabled] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [pendingProviderId, setPendingProviderId] = useState<string | null>(null)
  const [editingDomainsId, setEditingDomainsId] = useState<string | null>(null)
  const [domainDraft, setDomainDraft] = useState('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const loadProviders = async () => {
    try {
      const nextProviders = await fetchProviders()
      setProviders(nextProviders)
      setTableState(nextProviders.length === 0 ? 'empty' : 'idle')
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : String(loadError)
      setError(message)
      setTableState('error')
    }
  }

  const retryProviders = () => {
    setTableState('loading')
    setError(null)
    void loadProviders()
  }

  useEffect(() => {
    let active = true
    void fetchProviders()
      .then((nextProviders) => {
        if (!active) return
        setProviders(nextProviders)
        setTableState(nextProviders.length === 0 ? 'empty' : 'idle')
      })
      .catch((loadError: unknown) => {
        if (!active) return
        setError(loadError instanceof Error ? loadError.message : String(loadError))
        setTableState('error')
      })
    return () => { active = false }
  }, [])

  const applyPreset = (nextPreset: Preset) => {
    setPreset(nextPreset)
    setMetadataMode('url')
    setMetadataXml('')
    setDomains('')
    setDisabled(false)
    setAttributeMapping('')

    if (nextPreset === 'alphakey') {
      setResourceId('alphakey')
      setMetadataUrl(ALPHAKEY_METADATA_URL)
      setNameIdFormat('urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress')
      return
    }

    setResourceId(nextPreset === 'okta' ? 'okta' : '')
    setMetadataUrl('')
    setNameIdFormat('')
  }

  const copyValue = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey(null), 1500)
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : String(copyError))
    }
  }

  const registerProvider = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    let parsedAttributeMapping: Record<string, unknown> | undefined
    if (attributeMapping.trim()) {
      try {
        const parsed = JSON.parse(attributeMapping) as unknown
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('attribute_mapping 은 JSON 객체여야 합니다.')
        }
        parsedAttributeMapping = parsed as Record<string, unknown>
      } catch (parseError) {
        setError(parseError instanceof Error ? parseError.message : String(parseError))
        return
      }
    }

    const domainList = domains.split(',').map((domain) => domain.trim()).filter(Boolean)
    const payload = {
      ...(metadataMode === 'url'
        ? { metadata_url: metadataUrl.trim() }
        : { metadata_xml: metadataXml.trim() }),
      ...(resourceId.trim() ? { resource_id: resourceId.trim() } : {}),
      ...(domainList.length > 0 ? { domains: domainList } : {}),
      ...(nameIdFormat ? { name_id_format: nameIdFormat } : {}),
      ...(parsedAttributeMapping ? { attribute_mapping: parsedAttributeMapping } : {}),
      disabled,
    }

    setIsSaving(true)
    try {
      const response = await fetch('/api/admin/sso/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error(await readApiError(response))
      await loadProviders()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError))
    } finally {
      setIsSaving(false)
    }
  }

  const toggleProvider = async (provider: PublicSsoProvider) => {
    setPendingProviderId(provider.id)
    setError(null)
    try {
      const response = await fetch(`/api/admin/sso/providers/${encodeURIComponent(provider.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabled: !provider.disabled }),
      })
      if (!response.ok) throw new Error(await readApiError(response))
      await loadProviders()
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : String(toggleError))
    } finally {
      setPendingProviderId(null)
    }
  }

  const startEditingDomains = (provider: PublicSsoProvider) => {
    setEditingDomainsId(provider.id)
    setDomainDraft(provider.domains.map(({ domain }) => domain).join(', '))
  }

  const saveDomains = async (provider: PublicSsoProvider) => {
    const nextDomains = domainDraft.split(',').map((domain) => domain.trim()).filter(Boolean)
    const label = provider.resource_id ?? provider.saml.entity_id ?? provider.id
    const ok = await confirm({
      title: 'SSO 도메인 연결 변경',
      description: '도메인을 묶는 순간 해당 도메인의 SSO 라우팅이 즉시 살아납니다. 변경 내용을 저장하시겠습니까?',
      targets: nextDomains.length > 0 ? nextDomains : [`${label}: 연결된 도메인 전체 해제`],
      confirmLabel: '변경 저장',
    })
    if (!ok) return

    setPendingProviderId(provider.id)
    setError(null)
    try {
      const response = await fetch(`/api/admin/sso/providers/${encodeURIComponent(provider.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domains: nextDomains }),
      })
      if (!response.ok) throw new Error(await readApiError(response))
      await loadProviders()
      setEditingDomainsId(null)
      setDomainDraft('')
    } catch (domainError) {
      setError(domainError instanceof Error ? domainError.message : String(domainError))
    } finally {
      setPendingProviderId(null)
    }
  }

  const applyNameIdFormat = async (provider: PublicSsoProvider, next: string) => {
    if (!isSsoNameIdFormat(next)) return
    setPendingProviderId(provider.id)
    setError(null)
    try {
      const response = await fetch(`/api/admin/sso/providers/${encodeURIComponent(provider.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name_id_format: next }),
      })
      if (!response.ok) throw new Error(await readApiError(response))
      await loadProviders()
    } catch (formatError) {
      setError(formatError instanceof Error ? formatError.message : String(formatError))
    } finally {
      setPendingProviderId(null)
    }
  }

  const removeProvider = async (provider: PublicSsoProvider) => {
    const label = provider.resource_id ?? provider.saml.entity_id ?? provider.id
    const ok = await confirm({
      title: 'SSO 프로바이더 삭제',
      description: '삭제하면 이 IdP 로는 로그인할 수 없습니다.',
      targets: [label],
      destructive: true,
    })
    if (!ok) return

    setPendingProviderId(provider.id)
    setError(null)
    try {
      const response = await fetch(`/api/admin/sso/providers/${encodeURIComponent(provider.id)}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error(await readApiError(response))
      await loadProviders()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError))
    } finally {
      setPendingProviderId(null)
    }
  }

  const columns: AdminTableColumn<PublicSsoProvider>[] = [
    {
      key: 'resource',
      header: '식별자',
      cell: (provider) => provider.resource_id ?? '—',
      nowrap: true,
    },
    {
      key: 'entity',
      header: 'Entity ID',
      cell: (provider) => <span className="break-all text-xs">{provider.saml.entity_id ?? '—'}</span>,
      width: 'min-w-64',
    },
    {
      key: 'metadata',
      header: 'Metadata URL',
      cell: (provider) => <span className="break-all text-xs">{provider.saml.metadata_url ?? 'XML 직접 등록'}</span>,
      width: 'min-w-64',
    },
    {
      key: 'domains',
      header: '도메인',
      cell: (provider) => {
        if (editingDomainsId !== provider.id) {
          return provider.domains.length > 0
            ? provider.domains.map(({ domain }) => domain).join(', ')
            : '없음'
        }

        const isPending = pendingProviderId === provider.id
        return (
          <div className="min-w-64 space-y-2">
            <Input
              value={domainDraft}
              disabled={isPending}
              aria-label={`${provider.resource_id ?? 'SSO 프로바이더'} 도메인`}
              placeholder="쉼표로 구분, 모두 비우면 전체 해제"
              onChange={(event) => setDomainDraft(event.target.value)}
            />
            <div className="flex gap-2">
              <Button type="button" size="sm" disabled={isPending} onClick={() => void saveDomains(provider)}>
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                저장
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => {
                  setEditingDomainsId(null)
                  setDomainDraft('')
                }}
              >
                취소
              </Button>
            </div>
          </div>
        )
      },
      width: 'min-w-72',
    },
    {
      key: 'nameId',
      header: 'NameID 형식',
      cell: (provider) => {
        const isPending = pendingProviderId === provider.id
        return (
          <Select
            value={provider.saml.name_id_format ?? ''}
            disabled={isPending}
            onValueChange={(value) => void applyNameIdFormat(provider, value)}
          >
            <SelectTrigger
              className="min-w-40"
              aria-label={`${provider.resource_id ?? 'SSO 프로바이더'} NameID 형식`}
            >
              <SelectValue placeholder="미설정" />
            </SelectTrigger>
            <SelectContent>
              {SSO_NAME_ID_FORMATS.map((format) => (
                <SelectItem key={format} value={format}>{SSO_NAME_ID_LABEL[format]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      },
      width: 'min-w-48',
    },
    {
      key: 'status',
      header: '상태',
      cell: (provider) => (
        <span className={cn(
          'rounded-full px-2 py-0.5 text-xs font-medium',
          provider.disabled ? 'bg-muted text-muted-foreground' : 'bg-positive-soft text-positive'
        )}>
          {provider.disabled ? '비활성' : '활성'}
        </span>
      ),
      nowrap: true,
    },
    {
      key: 'created',
      header: '등록일',
      cell: (provider) => formatKst(provider.created_at),
      nowrap: true,
    },
    {
      key: 'actions',
      header: '관리',
      align: 'right',
      cell: (provider) => {
        const isPending = pendingProviderId === provider.id
        return (
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => startEditingDomains(provider)}
            >
              도메인
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => void toggleProvider(provider)}
            >
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : provider.disabled ? '활성화' : '비활성화'}
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              disabled={isPending}
              aria-label={`${provider.resource_id ?? 'SSO 프로바이더'} 삭제`}
              className="text-negative hover:text-negative"
              onClick={() => void removeProvider(provider)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )
      },
      nowrap: true,
    },
  ]

  return (
    <div className="space-y-8">
      <section>
        <AdminSectionHeader
          icon={ShieldCheck}
          title="서비스 프로바이더(SP) 정보"
          hint="IdP 담당자에게 아래 값을 그대로 전달하세요."
        />
        {SP_VALUES.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            NEXT_PUBLIC_SUPABASE_URL 이 설정되지 않아 SP 정보를 표시할 수 없습니다.
          </p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-3">
            {SP_VALUES.map((item) => (
              <div key={item.key} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-muted-foreground">{item.label}</p>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`${item.label} 복사`}
                    onClick={() => void copyValue(item.key, item.value)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="mt-2 break-all font-mono text-xs text-foreground">{item.value}</p>
                {copiedKey === item.key ? <p className="mt-1 text-xs text-positive">복사했습니다.</p> : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <AdminSectionHeader icon={KeyRound} title="SSO 프로바이더 등록" />
        <form onSubmit={registerProvider} className="space-y-5 rounded-xl border border-border bg-card p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sso-preset">프리셋</Label>
              <Select value={preset} onValueChange={(value) => applyPreset(value as Preset)}>
                <SelectTrigger id="sso-preset"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alphakey">알파키</SelectItem>
                  <SelectItem value="okta">Okta</SelectItem>
                  <SelectItem value="custom">직접입력</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sso-resource-id">외부 식별자</Label>
              <Input id="sso-resource-id" value={resourceId} onChange={(event) => setResourceId(event.target.value)} placeholder="예: alphakey" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>메타데이터 입력 방식</Label>
            <div className="flex gap-2" role="group" aria-label="메타데이터 입력 방식">
              <Button type="button" variant={metadataMode === 'url' ? 'default' : 'outline'} onClick={() => setMetadataMode('url')}>Metadata URL</Button>
              <Button type="button" variant={metadataMode === 'xml' ? 'default' : 'outline'} onClick={() => setMetadataMode('xml')}>Metadata XML 붙여넣기</Button>
            </div>
          </div>

          {metadataMode === 'url' ? (
            <div className="space-y-2">
              <Label htmlFor="sso-metadata-url">Metadata URL</Label>
              <Input id="sso-metadata-url" type="url" required value={metadataUrl} onChange={(event) => setMetadataUrl(event.target.value)} placeholder="https://..." />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="sso-metadata-xml">Metadata XML</Label>
              <textarea
                id="sso-metadata-xml"
                required
                value={metadataXml}
                onChange={(event) => setMetadataXml(event.target.value)}
                rows={8}
                className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="<EntityDescriptor ...>"
              />
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sso-domains">도메인 (쉼표 구분)</Label>
              <Input id="sso-domains" value={domains} onChange={(event) => setDomains(event.target.value)} placeholder="도메인 없이 먼저 등록" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sso-name-id-format">NameID 형식</Label>
              <Select
                value={nameIdFormat || 'none'}
                onValueChange={(value) => setNameIdFormat(value === 'none' ? '' : value as SsoNameIdFormat)}
              >
                <SelectTrigger id="sso-name-id-format"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">선택 안 함</SelectItem>
                  {SSO_NAME_ID_FORMATS.map((format) => (
                    <SelectItem key={format} value={format}>{SSO_NAME_ID_LABEL[format]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                emailAddress·unspecified 는 SAML 1.1, persistent·transient 는 SAML 2.0 네임스페이스입니다.
              </p>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={disabled} onChange={(event) => setDisabled(event.target.checked)} className="h-4 w-4 accent-brand-600" />
            비활성 상태로 등록
          </label>

          <details className="rounded-lg border border-border bg-muted/20">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-foreground">고급 설정</summary>
            <div className="space-y-2 border-t border-border p-4">
              <Label htmlFor="sso-attribute-mapping">attribute_mapping JSON</Label>
              <textarea
                id="sso-attribute-mapping"
                value={attributeMapping}
                onChange={(event) => setAttributeMapping(event.target.value)}
                rows={6}
                className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder={'{"keys":{"email":{"name":"email"}}}'}
              />
            </div>
          </details>

          {error ? <p className="rounded-lg border border-negative/30 bg-negative-soft px-3 py-2 text-sm text-negative" role="alert">{error}</p> : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">IdP 가 email 을 주지 않으면 handle_new_user() 가 가입을 차단합니다.</p>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isSaving ? '등록 중…' : '프로바이더 등록'}
            </Button>
          </div>
        </form>
      </section>

      <section>
        <AdminSectionHeader icon={ShieldCheck} title="등록된 SSO 프로바이더" />
        <AdminTable
          columns={columns}
          rows={providers}
          rowKey={(provider) => provider.id}
          minWidth="min-w-[1100px]"
          state={tableState}
          emptyMessage="등록된 SSO 프로바이더가 없습니다."
          errorMessage={error ?? 'SSO 프로바이더 목록을 불러오지 못했습니다.'}
          onRetry={retryProviders}
        />
      </section>
    </div>
  )
}
