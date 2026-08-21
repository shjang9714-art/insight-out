'use client'

import { useEffect, useState } from 'react'
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import AdminTabShell from '@/components/admin/ui/AdminTabShell'
import AdminTable, { type AdminTableColumn, type AdminTableState } from '@/components/admin/ui/AdminTable'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'
import { useAdminConfirm } from '@/components/admin/ui/AdminConfirm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface CuratedCompany {
  id: string
  name: string
  aliases: string[]
  groups: string[]
  is_competitor: boolean
  entity_id: string | null
  role: string | null
  sort_order: number
  is_active: boolean
  created_at: string
}

interface CuratedGroup {
  key: string
  label: string
  kind: 'watchlist' | 'competitor'
  display_mode: 'always' | 'on_issue'
  sort_order: number
  is_active: boolean
  created_at: string
}

interface CompanyForm {
  name: string
  aliases: string
  groups: string[]
  isCompetitor: boolean
  sortOrder: string
  isActive: boolean
}

interface GroupForm {
  key: string
  label: string
  kind: CuratedGroup['kind']
  displayMode: CuratedGroup['display_mode']
  sortOrder: string
  isActive: boolean
}

const TABS = [
  { value: 'companies', label: '기업' },
  { value: 'groups', label: '그룹' },
]

const EMPTY_COMPANY_FORM: CompanyForm = {
  name: '', aliases: '', groups: [], isCompetitor: false, sortOrder: '0', isActive: true,
}
const EMPTY_GROUP_FORM: GroupForm = {
  key: '', label: '', kind: 'watchlist', displayMode: 'always', sortOrder: '0', isActive: true,
}

async function responseJson<T>(response: Response): Promise<T & { error?: string }> {
  return response.json() as Promise<T & { error?: string }>
}

export default function CuratedAdminHub() {
  const confirm = useAdminConfirm()
  const [companies, setCompanies] = useState<CuratedCompany[]>([])
  const [groups, setGroups] = useState<CuratedGroup[]>([])
  const [companyState, setCompanyState] = useState<AdminTableState>('loading')
  const [groupState, setGroupState] = useState<AdminTableState>('loading')
  const [companyLoadError, setCompanyLoadError] = useState<string | null>(null)
  const [groupLoadError, setGroupLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [companyForm, setCompanyForm] = useState<CompanyForm>(EMPTY_COMPANY_FORM)
  const [groupForm, setGroupForm] = useState<GroupForm>(EMPTY_GROUP_FORM)
  const [editingCompany, setEditingCompany] = useState<CuratedCompany | null>(null)
  const [editingGroup, setEditingGroup] = useState<CuratedGroup | null>(null)
  const [showCompanyForm, setShowCompanyForm] = useState(false)
  const [showGroupForm, setShowGroupForm] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  async function loadCompanies() {
    setCompanyState('loading')
    try {
      const response = await fetch('/api/admin/curated/companies')
      const data = await responseJson<{ companies?: CuratedCompany[] }>(response)
      if (!response.ok) throw new Error(data.error ?? '주요기업 목록을 불러오지 못했습니다.')
      const next = data.companies ?? []
      setCompanies(next)
      setCompanyState(next.length > 0 ? 'idle' : 'empty')
      setCompanyLoadError(null)
    } catch (caught) {
      setCompanyLoadError(caught instanceof Error ? caught.message : '주요기업 목록을 불러오지 못했습니다.')
      setCompanyState('error')
    }
  }

  async function loadGroups() {
    setGroupState('loading')
    try {
      const response = await fetch('/api/admin/curated/groups')
      const data = await responseJson<{ groups?: CuratedGroup[] }>(response)
      if (!response.ok) throw new Error(data.error ?? '기업 그룹 목록을 불러오지 못했습니다.')
      const next = data.groups ?? []
      setGroups(next)
      setGroupState(next.length > 0 ? 'idle' : 'empty')
      setGroupLoadError(null)
    } catch (caught) {
      setGroupLoadError(caught instanceof Error ? caught.message : '기업 그룹 목록을 불러오지 못했습니다.')
      setGroupState('error')
    }
  }

  useEffect(() => {
    const init = async () => { await Promise.all([loadCompanies(), loadGroups()]) }
    void init()
  }, [])

  function openNewCompany() {
    setEditingCompany(null)
    setCompanyForm(EMPTY_COMPANY_FORM)
    setShowCompanyForm(true)
  }

  function openCompany(company: CuratedCompany) {
    setEditingCompany(company)
    setCompanyForm({
      name: company.name,
      aliases: company.aliases.join(', '),
      groups: company.groups,
      isCompetitor: company.is_competitor,
      sortOrder: String(company.sort_order),
      isActive: company.is_active,
    })
    setShowCompanyForm(true)
  }

  function openNewGroup() {
    setEditingGroup(null)
    setGroupForm(EMPTY_GROUP_FORM)
    setShowGroupForm(true)
  }

  function openGroup(group: CuratedGroup) {
    setEditingGroup(group)
    setGroupForm({
      key: group.key,
      label: group.label,
      kind: group.kind,
      displayMode: group.display_mode,
      sortOrder: String(group.sort_order),
      isActive: group.is_active,
    })
    setShowGroupForm(true)
  }

  async function getInsightCardCount(company: CuratedCompany, probeName?: string): Promise<number> {
    const query = probeName ? `?probeName=${encodeURIComponent(probeName)}` : ''
    const response = await fetch(`/api/admin/curated/companies/${company.id}${query}`)
    const data = await responseJson<{ insightCardCount?: number }>(response)
    if (!response.ok || typeof data.insightCardCount !== 'number') {
      throw new Error(data.error ?? '주간 시사점 건수를 확인하지 못했습니다.')
    }
    return data.insightCardCount
  }

  async function saveCompany(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    const name = companyForm.name.trim()
    if (!name) {
      setError('기업명을 입력해주세요.')
      return
    }
    if (editingCompany && name !== editingCompany.name) {
      try {
        const count = await getInsightCardCount(editingCompany, name)
        const accepted = await confirm({
          title: '기업명 변경',
          description: `이름을 바꾸면 옛 이름으로 생성된 주간 시사점 ${count}건이 서비스 기업동향에서 보이지 않게 됩니다.`,
          targets: [`${editingCompany.name} → ${name}`],
          confirmLabel: '이름 변경',
        })
        if (!accepted) return
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : '주간 시사점 건수를 확인하지 못했습니다.')
        return
      }
    }

    setIsSaving(true)
    try {
      const payload = {
        name,
        aliases: companyForm.aliases.split(',').map((alias) => alias.trim()).filter(Boolean),
        groups: companyForm.groups,
        is_competitor: companyForm.isCompetitor,
        sort_order: Number(companyForm.sortOrder),
        is_active: companyForm.isActive,
      }
      const response = await fetch(
        editingCompany ? `/api/admin/curated/companies/${editingCompany.id}` : '/api/admin/curated/companies',
        { method: editingCompany ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
      )
      const data = await responseJson<Record<string, never>>(response)
      if (!response.ok) throw new Error(data.error ?? '주요기업을 저장하지 못했습니다.')
      setShowCompanyForm(false)
      setEditingCompany(null)
      await loadCompanies()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '주요기업을 저장하지 못했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  async function saveGroup(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setIsSaving(true)
    try {
      const payload = {
        ...(!editingGroup ? { key: groupForm.key.trim() } : {}),
        label: groupForm.label.trim(),
        kind: groupForm.kind,
        display_mode: groupForm.displayMode,
        sort_order: Number(groupForm.sortOrder),
        is_active: groupForm.isActive,
      }
      const response = await fetch(
        editingGroup ? `/api/admin/curated/groups/${encodeURIComponent(editingGroup.key)}` : '/api/admin/curated/groups',
        { method: editingGroup ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
      )
      const data = await responseJson<Record<string, never>>(response)
      if (!response.ok) throw new Error(data.error ?? '기업 그룹을 저장하지 못했습니다.')
      setShowGroupForm(false)
      setEditingGroup(null)
      await Promise.all([loadGroups(), loadCompanies()])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '기업 그룹을 저장하지 못했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  async function toggleCompany(company: CuratedCompany) {
    setBusyKey(company.id)
    const response = await fetch(`/api/admin/curated/companies/${company.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !company.is_active }),
    })
    const data = await responseJson<Record<string, never>>(response)
    if (!response.ok) setError(data.error ?? '활성 상태를 변경하지 못했습니다.')
    else await loadCompanies()
    setBusyKey(null)
  }

  async function toggleGroup(group: CuratedGroup) {
    setBusyKey(group.key)
    const response = await fetch(`/api/admin/curated/groups/${encodeURIComponent(group.key)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !group.is_active }),
    })
    const data = await responseJson<Record<string, never>>(response)
    if (!response.ok) setError(data.error ?? '활성 상태를 변경하지 못했습니다.')
    else await loadGroups()
    setBusyKey(null)
  }

  async function deleteCompany(company: CuratedCompany) {
    try {
      const count = await getInsightCardCount(company)
      const accepted = await confirm({
        title: '주요기업 완전 삭제',
        description: `${company.name} 이름의 주간 시사점 ${count}건이 있습니다. 삭제 대신 비활성을 권장합니다.`,
        targets: [company.name], confirmLabel: '완전 삭제', destructive: true,
      })
      if (!accepted) return
      const response = await fetch(`/api/admin/curated/companies/${company.id}`, { method: 'DELETE' })
      const data = await responseJson<Record<string, never>>(response)
      if (!response.ok) throw new Error(data.error ?? '주요기업을 삭제하지 못했습니다.')
      await loadCompanies()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '주요기업을 삭제하지 못했습니다.')
    }
  }

  async function deleteGroup(group: CuratedGroup) {
    const accepted = await confirm({
      title: '기업 그룹 완전 삭제',
      description: '소속 기업이 있으면 서버가 삭제를 거부합니다. 삭제 대신 비활성을 권장합니다.',
      targets: [`${group.label} (${group.key})`], confirmLabel: '완전 삭제', destructive: true,
    })
    if (!accepted) return
    const response = await fetch(`/api/admin/curated/groups/${encodeURIComponent(group.key)}`, { method: 'DELETE' })
    const data = await responseJson<Record<string, never>>(response)
    if (!response.ok) {
      setError(data.error ?? '기업 그룹을 삭제하지 못했습니다.')
      return
    }
    await Promise.all([loadGroups(), loadCompanies()])
  }

  const groupLabels = new Map(groups.map((group) => [group.key, group.label]))
  const companyColumns: AdminTableColumn<CuratedCompany>[] = [
    { key: 'name', header: '이름', cell: (row) => <div><p className="font-medium">{row.name}</p><p className="text-xs text-muted-foreground">{row.role ?? '역할 미지정'} · {row.entity_id ?? '엔티티 미연결'}</p></div> },
    { key: 'aliases', header: '별칭', cell: (row) => row.aliases.join(', ') || '—', truncate: 2 },
    { key: 'groups', header: '그룹', cell: (row) => row.groups.map((key) => groupLabels.get(key) ?? key).join(', ') || '—', truncate: 2 },
    { key: 'competitor', header: '경쟁사', align: 'center', cell: (row) => row.is_competitor ? '예' : '아니오' },
    { key: 'sort', header: '정렬', numeric: true, cell: (row) => row.sort_order },
    { key: 'active', header: '활성', align: 'center', cell: (row) => <ActiveButton active={row.is_active} disabled={busyKey === row.id} onClick={() => void toggleCompany(row)} /> },
    { key: 'actions', header: '관리', nowrap: true, cell: (row) => <RowActions onEdit={() => openCompany(row)} onDelete={() => void deleteCompany(row)} /> },
  ]
  const groupColumns: AdminTableColumn<CuratedGroup>[] = [
    { key: 'key', header: 'key', cell: (row) => <span className="font-mono text-xs">{row.key}</span> },
    { key: 'label', header: '그룹명', cell: (row) => <span className="font-medium">{row.label}</span> },
    { key: 'kind', header: '종류', cell: (row) => row.kind === 'watchlist' ? '워치리스트' : '경쟁사' },
    { key: 'mode', header: '표시 방식', cell: (row) => row.display_mode === 'always' ? '항상' : '이슈 시' },
    { key: 'sort', header: '정렬', numeric: true, cell: (row) => row.sort_order },
    { key: 'active', header: '활성', align: 'center', cell: (row) => <ActiveButton active={row.is_active} disabled={busyKey === row.key} onClick={() => void toggleGroup(row)} /> },
    { key: 'actions', header: '관리', nowrap: true, cell: (row) => <RowActions onEdit={() => openGroup(row)} onDelete={() => void deleteGroup(row)} /> },
  ]

  return (
    <AdminTabShell
      tabs={TABS}
      defaultTab="companies"
      aria-label="주요기업·그룹 관리"
      renderContent={(tab) => tab === 'groups' ? (
        <section className="space-y-4">
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => void loadGroups()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />새로고침</Button>
            <Button variant="brand" size="sm" onClick={openNewGroup}><Plus className="mr-1.5 h-3.5 w-3.5" />그룹 추가</Button>
          </div>
          {error && <AdminErrorBox>{error}</AdminErrorBox>}
          {showGroupForm && <GroupEditor form={groupForm} setForm={setGroupForm} editing={editingGroup} isSaving={isSaving} onSubmit={saveGroup} onCancel={() => setShowGroupForm(false)} />}
          <AdminTable columns={groupColumns} rows={groups} rowKey={(row) => row.key} state={groupState} errorMessage={groupLoadError ?? undefined} onRetry={() => void loadGroups()} emptyMessage="등록된 기업 그룹이 없습니다." />
        </section>
      ) : (
        <section className="space-y-4">
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => void loadCompanies()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />새로고침</Button>
            <Button variant="brand" size="sm" onClick={openNewCompany}><Plus className="mr-1.5 h-3.5 w-3.5" />기업 추가</Button>
          </div>
          {error && <AdminErrorBox>{error}</AdminErrorBox>}
          {showCompanyForm && <CompanyEditor form={companyForm} setForm={setCompanyForm} editing={editingCompany} groups={groups} isSaving={isSaving} onSubmit={saveCompany} onCancel={() => setShowCompanyForm(false)} />}
          <AdminTable columns={companyColumns} rows={companies} rowKey={(row) => row.id} state={companyState} errorMessage={companyLoadError ?? undefined} onRetry={() => void loadCompanies()} emptyMessage="등록된 주요기업이 없습니다." minWidth="min-w-[1100px]" />
        </section>
      )}
    />
  )
}

function ActiveButton({ active, disabled, onClick }: { active: boolean; disabled: boolean; onClick: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} className={cn('rounded-full px-2.5 py-1 text-xs font-medium disabled:opacity-50', active ? 'bg-positive-soft text-positive' : 'bg-muted text-muted-foreground')}>{active ? '활성' : '비활성'}</button>
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return <div className="flex gap-1"><Button type="button" size="icon-sm" variant="ghost" title="편집" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button><Button type="button" size="icon-sm" variant="ghost" title="완전 삭제" onClick={onDelete}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></div>
}

function CompanyEditor({ form, setForm, editing, groups, isSaving, onSubmit, onCancel }: {
  form: CompanyForm
  setForm: (form: CompanyForm) => void
  editing: CuratedCompany | null
  groups: CuratedGroup[]
  isSaving: boolean
  onSubmit: (event: React.FormEvent) => void
  onCancel: () => void
}) {
  const toggleGroup = (key: string) => setForm({ ...form, groups: form.groups.includes(key) ? form.groups.filter((item) => item !== key) : [...form.groups, key] })
  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border bg-card p-5">
      <h2 className="font-semibold">{editing ? '주요기업 편집' : '주요기업 추가'}</h2>
      {editing && <p className="text-xs text-muted-foreground">엔티티 ID: {editing.entity_id ?? '미연결'} · 역할: {editing.role ?? '미지정'} (읽기 전용)</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1.5"><Label>기업명</Label><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
        <label className="space-y-1.5"><Label>별칭 (쉼표 구분)</Label><Input value={form.aliases} onChange={(event) => setForm({ ...form, aliases: event.target.value })} /></label>
        <label className="space-y-1.5"><Label>정렬 순서</Label><Input type="number" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: event.target.value })} required /></label>
        <div className="space-y-2"><Label>속성</Label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isCompetitor} onChange={(event) => setForm({ ...form, isCompetitor: event.target.checked })} className="h-4 w-4 accent-brand-600" />경쟁사</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} className="h-4 w-4 accent-brand-600" />활성</label></div>
      </div>
      <fieldset className="space-y-2"><legend className="text-sm font-medium">소속 그룹</legend><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{groups.map((group) => <label key={group.key} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"><input type="checkbox" checked={form.groups.includes(group.key)} onChange={() => toggleGroup(group.key)} className="h-4 w-4 accent-brand-600" />{group.label}<span className="text-xs text-muted-foreground">({group.key})</span></label>)}</div></fieldset>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onCancel}>취소</Button><Button type="submit" variant="brand" disabled={isSaving}>{isSaving ? '저장 중...' : '저장'}</Button></div>
    </form>
  )
}

function GroupEditor({ form, setForm, editing, isSaving, onSubmit, onCancel }: {
  form: GroupForm
  setForm: (form: GroupForm) => void
  editing: CuratedGroup | null
  isSaving: boolean
  onSubmit: (event: React.FormEvent) => void
  onCancel: () => void
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border bg-card p-5">
      <h2 className="font-semibold">{editing ? '기업 그룹 편집' : '기업 그룹 추가'}</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <label className="space-y-1.5"><Label>key</Label><Input value={form.key} onChange={(event) => setForm({ ...form, key: event.target.value })} disabled={Boolean(editing)} required /><span className="text-xs text-muted-foreground">key는 생성 후 바꿀 수 없습니다.</span></label>
        <label className="space-y-1.5"><Label>그룹명</Label><Input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} required /></label>
        <label className="space-y-1.5"><Label>정렬 순서</Label><Input type="number" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: event.target.value })} required /></label>
        <label className="space-y-1.5"><Label>종류</Label><Select value={form.kind} onValueChange={(value: CuratedGroup['kind']) => setForm({ ...form, kind: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="watchlist">워치리스트</SelectItem><SelectItem value="competitor">경쟁사</SelectItem></SelectContent></Select></label>
        <label className="space-y-1.5"><Label>표시 방식</Label><Select value={form.displayMode} onValueChange={(value: CuratedGroup['display_mode']) => setForm({ ...form, displayMode: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="always">항상</SelectItem><SelectItem value="on_issue">이슈 시</SelectItem></SelectContent></Select></label>
        <label className="flex items-center gap-2 self-end pb-3 text-sm"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} className="h-4 w-4 accent-brand-600" />활성</label>
      </div>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onCancel}>취소</Button><Button type="submit" variant="brand" disabled={isSaving}>{isSaving ? '저장 중...' : '저장'}</Button></div>
    </form>
  )
}
