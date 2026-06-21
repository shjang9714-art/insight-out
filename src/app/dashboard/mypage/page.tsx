'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
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
import { ChevronDown, ChevronRight, Mail, Trash2, X, Building2 } from 'lucide-react'
import type {
  Department,
  ContentFilterMode,
  Service,
} from '@/lib/types'

const MAX_WATCHLIST = 20

const DEPARTMENTS: Department[] = [
  'Enterprise사업부문',
  'SMB사업부문',
  '공공사업부문',
  '기술부문',
  '마케팅부문',
  '기타',
]


type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface ProfileForm {
  name: string
  department: Department
  team: string
  position: string
  content_filter_mode: ContentFilterMode
}

interface NewsletterForm {
  is_active: boolean
  newsletter_email: string
}

export default function MyPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [authEmail, setAuthEmail] = useState('')

  const [profile, setProfile] = useState<ProfileForm>({
    name: '',
    department: '기타',
    team: '',
    position: '',
    content_filter_mode: 'all',
  })
  const [profileStatus, setProfileStatus] = useState<SaveStatus>('idle')
  const [profileError, setProfileError] = useState<string | null>(null)

  const [services, setServices] = useState<Service[]>([])
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<string>>(new Set())
  const [servicesStatus, setServicesStatus] = useState<SaveStatus>('idle')
  const [servicesError, setServicesError] = useState<string | null>(null)

  const [newsletter, setNewsletter] = useState<NewsletterForm>({
    is_active: true,
    newsletter_email: '',
  })
  const [newsletterStatus, setNewsletterStatus] = useState<SaveStatus>('idle')
  const [newsletterError, setNewsletterError] = useState<string | null>(null)

  // ── 관심업체 워치리스트 ────────────────────────────────────────────────
  const [watchlist, setWatchlist]             = useState<string[]>([])
  const [watchlistInput, setWatchlistInput]   = useState('')
  const [watchlistStatus, setWatchlistStatus] = useState<SaveStatus>('idle')
  const [watchlistError, setWatchlistError]   = useState<string | null>(null)

  // ── 북마크 ──────────────────────────────────────────────────────────────
  interface BookmarkWithItem {
    id: string
    content_id: string | null
    youtube_video_id: string | null
    created_at: string
    contents: {
      id: string
      title: string
      category: string
      original_url: string | null
      published_at: string | null
    } | null
    youtube_videos: {
      id: string
      video_id: string
      title: string
      channel_name: string
      published_at: string | null
    } | null
  }
  const [bookmarks, setBookmarks] = useState<BookmarkWithItem[]>([])
  const [bookmarksLoading, setBookmarksLoading] = useState(true)
  const [bookmarkError, setBookmarkError] = useState<string | null>(null)

  // ── 아카이브 ──────────────────────────────────────────────────────────────
  interface ArchiveWithItems {
    id: string
    name: string
    description: string | null
    created_at: string
    items: {
      content_id: string | null
      youtube_video_id: string | null
      added_at: string
      contents: { id: string; title: string; category: string; original_url: string | null } | null
    }[]
  }
  const [archives, setArchives]             = useState<ArchiveWithItems[]>([])
  const [archivesLoading, setArchivesLoading] = useState(true)
  const [expandedArchiveId, setExpandedArchiveId] = useState<string | null>(null)
  const [archiveError, setArchiveError]     = useState<string | null>(null)
  const [sendingArchiveId, setSendingArchiveId] = useState<string | null>(null)
  const [sendResult, setSendResult]         = useState<{ archiveId: string; to: string } | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      setAuthEmail(user.email ?? '')

      const [
        { data: userRow },
        { data: userServices },
        { data: allServices },
        { data: sub },
        { data: bookmarksData },
        { data: archivesData },
        { data: watchlistData },
      ] = await Promise.all([
        supabase.from('users').select('name, department, team, position, content_filter_mode').eq('id', user.id).single(),
        supabase.from('user_services').select('service_id').eq('user_id', user.id),
        supabase.from('services').select('*').order('order'),
        supabase.from('newsletter_subscriptions').select('is_active, newsletter_email').eq('user_id', user.id).single(),
        supabase
          .from('bookmarks')
          .select(`
            id, content_id, youtube_video_id, created_at,
            contents(id, title, category, original_url, published_at),
            youtube_videos(id, video_id, title, channel_name, published_at)
          `)
          .order('created_at', { ascending: false }),
        supabase
          .from('archives')
          .select(`id, name, description, created_at, items:archive_items(content_id, youtube_video_id, added_at, contents(id, title, category, original_url))`)
          .order('created_at', { ascending: false }),
        supabase
          .from('user_watchlist')
          .select('company')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })
          .limit(MAX_WATCHLIST),
      ])

      if (userRow) {
        setProfile({
          name: userRow.name ?? '',
          department: (userRow.department as Department) ?? '기타',
          team: userRow.team ?? '',
          position: userRow.position ?? '',
          content_filter_mode: (userRow.content_filter_mode as ContentFilterMode) ?? 'all',
        })
      }

      if (allServices) setServices(allServices)
      if (userServices) setSelectedServiceIds(new Set(userServices.map((r) => r.service_id)))
      if (watchlistData) setWatchlist(watchlistData.map(r => r.company))
      if (bookmarksData) setBookmarks(bookmarksData as unknown as BookmarkWithItem[])
      setBookmarksLoading(false)
      if (archivesData) setArchives(archivesData as unknown as ArchiveWithItems[])
      setArchivesLoading(false)

      if (sub) {
        setNewsletter({
          is_active: sub.is_active ?? true,
          newsletter_email: sub.newsletter_email ?? (user.email ?? ''),
        })
      } else {
        setNewsletter((prev) => ({ ...prev, newsletter_email: user.email ?? '' }))
      }

      setLoading(false)
    }

    load()
  }, [])

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!profile.name.trim()) {
      setProfileError('이름을 입력해주세요.')
      return
    }
    if (!profile.team.trim()) {
      setProfileError('팀명을 입력해주세요.')
      return
    }

    setProfileError(null)
    setProfileStatus('saving')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('로그인 정보를 찾을 수 없습니다.')

      const { error } = await supabase
        .from('users')
        .update({
          name: profile.name,
          department: profile.department,
          team: profile.team,
          position: profile.position || null,
          content_filter_mode: profile.content_filter_mode,
        })
        .eq('id', user.id)

      if (error) throw new Error(`저장 실패: ${error.message}`)

      setProfileStatus('saved')
      setTimeout(() => setProfileStatus('idle'), 2500)
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : '오류가 발생했습니다.')
      setProfileStatus('error')
    }
  }

  const toggleService = (id: string) => {
    setSelectedServiceIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleServicesSave = async () => {
    setServicesError(null)
    setServicesStatus('saving')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('로그인 정보를 찾을 수 없습니다.')

      const { error: deleteError } = await supabase
        .from('user_services')
        .delete()
        .eq('user_id', user.id)
      if (deleteError) throw new Error(`삭제 실패: ${deleteError.message}`)

      if (selectedServiceIds.size > 0) {
        const rows = Array.from(selectedServiceIds).map((service_id) => ({
          user_id: user.id,
          service_id,
          is_pinned: false,
        }))
        const { error: insertError } = await supabase.from('user_services').insert(rows)
        if (insertError) throw new Error(`저장 실패: ${insertError.message}`)
      }

      setServicesStatus('saved')
      setTimeout(() => setServicesStatus('idle'), 2500)
    } catch (err) {
      setServicesError(err instanceof Error ? err.message : '오류가 발생했습니다.')
      setServicesStatus('error')
    }
  }

  const handleNewsletterSave = async (e: React.FormEvent) => {
    e.preventDefault()

    if (newsletter.is_active) {
      if (!newsletter.newsletter_email.trim()) {
        setNewsletterError('수신할 이메일 주소를 입력해주세요.')
        return
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newsletter.newsletter_email.trim())) {
        setNewsletterError('올바른 이메일 형식을 입력해주세요.')
        return
      }
    }

    setNewsletterError(null)
    setNewsletterStatus('saving')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('로그인 정보를 찾을 수 없습니다.')

      const { error } = await supabase
        .from('newsletter_subscriptions')
        .upsert(
          {
            user_id: user.id,
            is_active: newsletter.is_active,
            newsletter_email: newsletter.is_active ? newsletter.newsletter_email.trim() : null,
          },
          { onConflict: 'user_id' }
        )

      if (error) throw new Error(`저장 실패: ${error.message}`)

      setNewsletterStatus('saved')
      setTimeout(() => setNewsletterStatus('idle'), 2500)
    } catch (err) {
      setNewsletterError(err instanceof Error ? err.message : '오류가 발생했습니다.')
      setNewsletterStatus('error')
    }
  }

  // ── 관심업체 핸들러 ────────────────────────────────────────────────────
  const addWatchlistChip = (raw: string) => {
    const company = raw.trim()
    if (!company || watchlist.includes(company) || watchlist.length >= MAX_WATCHLIST) return
    setWatchlist(prev => [...prev, company])
    setWatchlistInput('')
  }

  const handleWatchlistKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addWatchlistChip(watchlistInput)
    } else if (e.key === 'Backspace' && watchlistInput === '' && watchlist.length > 0) {
      setWatchlist(prev => prev.slice(0, -1))
    }
  }

  const handleWatchlistSave = async () => {
    setWatchlistError(null)
    setWatchlistStatus('saving')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('로그인 정보를 찾을 수 없습니다.')

      const { error: delErr } = await supabase
        .from('user_watchlist')
        .delete()
        .eq('user_id', user.id)
      if (delErr) throw new Error(`삭제 실패: ${delErr.message}`)

      if (watchlist.length > 0) {
        const rows = watchlist.map(company => ({ user_id: user.id, company }))
        const { error: insErr } = await supabase.from('user_watchlist').insert(rows)
        if (insErr) throw new Error(`저장 실패: ${insErr.message}`)
      }

      setWatchlistStatus('saved')
      setTimeout(() => setWatchlistStatus('idle'), 2500)
    } catch (err) {
      setWatchlistError(err instanceof Error ? err.message : '오류가 발생했습니다.')
      setWatchlistStatus('error')
    }
  }

  // ── 북마크 핸들러 ──────────────────────────────────────────────────────
  async function handleRemoveBookmark(bookmarkId: string) {
    setBookmarkError(null)
    const { error } = await supabase.from('bookmarks').delete().eq('id', bookmarkId)
    if (error) {
      setBookmarkError('북마크 해제에 실패했습니다. 잠시 후 다시 시도해주세요.')
    } else {
      setBookmarks((prev) => prev.filter((bookmark) => bookmark.id !== bookmarkId))
    }
  }

  // ── 아카이브 핸들러 ──────────────────────────────────────────────────────
  async function handleDeleteArchive(archiveId: string) {
    if (!window.confirm('아카이브를 삭제하면 담긴 항목도 모두 사라집니다. 계속할까요?')) return
    setArchiveError(null)
    const { error } = await supabase.from('archives').delete().eq('id', archiveId)
    if (error) {
      setArchiveError('삭제에 실패했습니다. 잠시 후 다시 시도해주세요.')
    } else {
      setArchives((prev) => prev.filter((a) => a.id !== archiveId))
      if (expandedArchiveId === archiveId) setExpandedArchiveId(null)
    }
  }

  async function handleRemoveItem(archiveId: string, contentId: string | null, youtubeId: string | null) {
    setArchiveError(null)
    let query = supabase.from('archive_items').delete().eq('archive_id', archiveId)
    if (contentId) query = query.eq('content_id', contentId)
    else if (youtubeId) query = query.eq('youtube_video_id', youtubeId)

    const { error } = await query
    if (error) {
      setArchiveError('항목 제거에 실패했습니다.')
    } else {
      setArchives((prev) =>
        prev.map((a) =>
          a.id === archiveId
            ? {
                ...a,
                items: a.items.filter((item) =>
                  contentId ? item.content_id !== contentId : item.youtube_video_id !== youtubeId
                ),
              }
            : a
        )
      )
    }
  }

  async function handleSendEmail(archiveId: string) {
    setSendingArchiveId(archiveId)
    setArchiveError(null)
    setSendResult(null)
    try {
      const res = await fetch('/api/email/send-archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archiveId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '발송에 실패했습니다.')
      setSendResult({ archiveId, to: data.to })
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : '이메일 발송에 실패했습니다.')
    } finally {
      setSendingArchiveId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">불러오는 중...</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-brand-600 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          대시보드로 돌아가기
        </button>
        <h1 className="text-xl font-bold text-foreground">마이페이지</h1>
        <p className="mt-1 text-sm text-muted-foreground">{authEmail}</p>
      </div>

      <div className="space-y-6">
        {/* 프로필 정보 */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-5 text-base font-semibold text-foreground">프로필 정보</h2>

          <form onSubmit={handleProfileSave} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">이름 <span className="text-red-500">*</span></Label>
              <Input
                id="name"
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                placeholder="홍길동"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="department">부문 <span className="text-red-500">*</span></Label>
                <Select
                  value={profile.department}
                  onValueChange={(v) => setProfile({ ...profile, department: v as Department })}
                >
                  <SelectTrigger id="department">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="team">팀 <span className="text-red-500">*</span></Label>
                <Input
                  id="team"
                  value={profile.team}
                  onChange={(e) => setProfile({ ...profile, team: e.target.value })}
                  placeholder="예: 솔루션영업1팀"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="position">
                직책 <span className="text-xs font-normal text-muted-foreground">(선택)</span>
              </Label>
              <Input
                id="position"
                value={profile.position}
                onChange={(e) => setProfile({ ...profile, position: e.target.value })}
                placeholder="예: 팀장, 매니저"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>콘텐츠 보기 방식</Label>
              <div className="flex gap-2">
                {(
                  [
                    { value: 'my_services' as ContentFilterMode, label: '담당 서비스만' },
                    { value: 'all' as ContentFilterMode, label: '전체 보기' },
                  ] as const
                ).map((opt) => {
                  const isSelected = profile.content_filter_mode === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setProfile({ ...profile, content_filter_mode: opt.value })}
                      className={cn(
                        'flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all',
                        isSelected
                          ? 'border-blue-500 bg-blue-50 text-blue-900'
                          : 'border-border bg-card text-foreground hover:border-border hover:bg-accent'
                      )}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {profileError && (
              <p className="text-xs text-red-500">{profileError}</p>
            )}

            <Button
              type="submit"
              disabled={profileStatus === 'saving'}
              className="mt-1 w-full h-10"
            >
              {profileStatus === 'saving' ? '저장 중...' : profileStatus === 'saved' ? '저장되었습니다!' : '프로필 저장'}
            </Button>
          </form>
        </section>

        {/* 담당 서비스 */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-foreground">담당 서비스</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              담당하거나 관심 있는 서비스를 선택하세요. 인사이동 시 여기서 업데이트하세요.
            </p>
          </div>

          {services.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">등록된 서비스가 없습니다.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {services.map((svc) => {
                const isSelected = selectedServiceIds.has(svc.id)
                return (
                  <button
                    key={svc.id}
                    type="button"
                    onClick={() => toggleService(svc.id)}
                    className={cn(
                      'flex flex-col gap-0.5 rounded-xl border p-3 text-left transition-all',
                      isSelected
                        ? 'border-blue-500 bg-blue-50 text-blue-900'
                        : 'border-border bg-card text-foreground hover:border-border hover:bg-accent'
                    )}
                  >
                    {svc.icon && <span className="text-lg">{svc.icon}</span>}
                    <span className="text-sm font-medium leading-tight">{svc.name}</span>
                    {svc.description && (
                      <span className="text-xs text-muted-foreground line-clamp-1">{svc.description}</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {servicesError && (
            <p className="mt-3 text-xs text-red-500">{servicesError}</p>
          )}

          <Button
            type="button"
            onClick={handleServicesSave}
            disabled={servicesStatus === 'saving'}
            className="mt-4 w-full h-10"
          >
            {servicesStatus === 'saving' ? '저장 중...' : servicesStatus === 'saved' ? '저장되었습니다!' : '서비스 저장'}
          </Button>
        </section>

        {/* 관심업체 워치리스트 */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-5 flex items-start gap-2">
            <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
            <div>
              <h2 className="text-base font-semibold text-foreground">관심업체</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                동향을 추적할 업체명을 자유롭게 추가하세요. 기사 제목·요약에 그 이름이 잡히면 AI 분석 페이지에서 모아 보여줍니다.
              </p>
            </div>
          </div>

          {/* 칩 입력 박스 */}
          <div className="flex flex-wrap gap-1.5 min-h-[42px] rounded-lg border border-border bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-brand-600/30">
            {watchlist.map(company => (
              <span
                key={company}
                className="inline-flex items-center gap-1 rounded-md bg-brand-600/10 px-2 py-0.5 text-xs font-medium text-brand-600"
              >
                {company}
                <button
                  type="button"
                  onClick={() => setWatchlist(prev => prev.filter(c => c !== company))}
                  className="ml-0.5 hover:text-brand-700"
                  aria-label={`${company} 제거`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              type="text"
              value={watchlistInput}
              onChange={e => setWatchlistInput(e.target.value)}
              onKeyDown={handleWatchlistKeyDown}
              onBlur={() => addWatchlistChip(watchlistInput)}
              placeholder={watchlist.length === 0 ? 'Enter로 업체 추가 (예: 삼성전자, KT, AWS)' : ''}
              disabled={watchlist.length >= MAX_WATCHLIST}
              className="flex-1 min-w-[140px] bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
            />
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Enter 또는 포커스 이탈 시 추가 · Backspace로 마지막 항목 삭제 · 최대 {MAX_WATCHLIST}개
          </p>

          {watchlistError && (
            <p className="mt-2 text-xs text-red-500">{watchlistError}</p>
          )}

          <Button
            type="button"
            onClick={() => void handleWatchlistSave()}
            disabled={watchlistStatus === 'saving'}
            className="mt-4 w-full h-10"
          >
            {watchlistStatus === 'saving' ? '저장 중...' : watchlistStatus === 'saved' ? '저장되었습니다!' : '관심업체 저장'}
          </Button>
        </section>

        {/* 뉴스레터 설정 */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-5 text-base font-semibold text-foreground">뉴스레터 설정</h2>

          <form onSubmit={handleNewsletterSave} className="flex flex-col gap-4">
            <div className="flex items-center justify-between rounded-xl border border-border p-4">
              <div>
                <p className="text-sm font-medium text-foreground">뉴스레터 수신</p>
                <p className="text-xs text-muted-foreground mt-0.5">어드민 설정 일정에 따라 자동 발송됩니다.</p>
              </div>
              <button
                type="button"
                onClick={() => setNewsletter({ ...newsletter, is_active: !newsletter.is_active })}
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                  newsletter.is_active ? 'bg-blue-600' : 'bg-muted'
                )}
                role="switch"
                aria-checked={newsletter.is_active}
              >
                <span
                  className={cn(
                    'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
                    newsletter.is_active ? 'translate-x-5' : 'translate-x-0'
                  )}
                />
              </button>
            </div>

            {newsletter.is_active && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="newsletter-email">
                  수신 이메일 <span className="text-red-500">*</span>
                </Label>
                <p className="text-xs text-muted-foreground">Gmail 또는 사내 이메일로 받아보실 수 있습니다.</p>
                <Input
                  id="newsletter-email"
                  type="email"
                  value={newsletter.newsletter_email}
                  onChange={(e) => {
                    setNewsletter({ ...newsletter, newsletter_email: e.target.value })
                    setNewsletterError(null)
                  }}
                  placeholder="예: name@lguplus.co.kr"
                />
              </div>
            )}

            {newsletterError && (
              <p className="text-xs text-red-500">{newsletterError}</p>
            )}

            <Button
              type="submit"
              disabled={newsletterStatus === 'saving'}
              className="mt-1 w-full h-10"
            >
              {newsletterStatus === 'saving' ? '저장 중...' : newsletterStatus === 'saved' ? '저장되었습니다!' : '뉴스레터 설정 저장'}
            </Button>
          </form>
        </section>

        {/* 내 북마크 */}
        <section id="bookmarks" className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-foreground">내 북마크</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              빠르게 다시 볼 콘텐츠와 영상을 모아둔 목록입니다.
            </p>
          </div>

          {bookmarksLoading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">불러오는 중...</p>
          ) : bookmarks.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              아직 저장한 북마크가 없습니다. 콘텐츠 상세 페이지에서 &quot;북마크&quot;를 눌러 보세요.
            </div>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border">
              {bookmarks.map((bookmark) => {
                const content = bookmark.contents
                const video = bookmark.youtube_videos
                const youtubeUrl = video
                  ? `https://www.youtube.com/watch?v=${video.video_id}`
                  : null
                const date = content?.published_at ?? video?.published_at ?? bookmark.created_at

                return (
                  <div
                    key={bookmark.id}
                    className="flex items-start justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      {content ? (
                        <Link
                          href={`/dashboard/contents/${content.id}`}
                          className="line-clamp-1 text-sm font-medium text-foreground hover:text-brand-600"
                        >
                          {content.title}
                        </Link>
                      ) : video && youtubeUrl ? (
                        <a
                          href={youtubeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="line-clamp-1 text-sm font-medium text-foreground hover:text-brand-600"
                        >
                          {video.title}
                        </a>
                      ) : (
                        <span className="text-sm text-muted-foreground">(삭제된 항목)</span>
                      )}
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {content?.category ?? video?.channel_name ?? '북마크'} ·{' '}
                        {new Date(date).toLocaleDateString('ko-KR')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveBookmark(bookmark.id)}
                      className="shrink-0 rounded p-1 text-muted-foreground/40 transition-colors hover:text-red-400"
                      title="북마크 해제"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {bookmarkError && (
            <p className="mt-3 text-xs text-red-500">{bookmarkError}</p>
          )}
        </section>

        {/* 내 아카이브 */}
        <section id="archives" className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-foreground">내 아카이브</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              담아둔 콘텐츠 모음입니다. 아카이브 단위로 이메일로 받아볼 수 있습니다.
            </p>
          </div>

          {archivesLoading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">불러오는 중...</p>
          ) : archives.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              아직 담아둔 아카이브가 없습니다. 콘텐츠 상세 페이지에서 &quot;아카이빙 담기&quot;를 눌러 보세요.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {archives.map((archive) => (
                <div key={archive.id} className="overflow-hidden rounded-xl border border-border">
                  {/* 아카이브 헤더 */}
                  <div className="flex items-center justify-between bg-muted px-4 py-3">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedArchiveId(
                          expandedArchiveId === archive.id ? null : archive.id
                        )
                      }
                      className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-brand-600"
                    >
                      {expandedArchiveId === archive.id
                        ? <ChevronDown className="h-4 w-4" />
                        : <ChevronRight className="h-4 w-4" />}
                      {archive.name}
                      <span className="text-xs font-normal text-muted-foreground">
                        {archive.items.length}건
                      </span>
                    </button>
                    <div className="flex items-center gap-1.5">
                      {/* 이메일로 받기 */}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleSendEmail(archive.id)}
                        disabled={sendingArchiveId === archive.id}
                        className="h-7 text-xs"
                      >
                        <Mail className="mr-1 h-3.5 w-3.5" />
                        {sendingArchiveId === archive.id ? '발송 중...' : '이메일로 받기'}
                      </Button>
                      {/* 삭제 */}
                      <button
                        type="button"
                        onClick={() => handleDeleteArchive(archive.id)}
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-50/80 hover:text-red-500"
                        title="아카이브 삭제"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* 발송 완료 메시지 */}
                  {sendResult?.archiveId === archive.id && (
                    <p className="bg-green-50 px-4 py-2 text-xs text-green-600">
                      {sendResult.to} 으로 발송되었습니다.
                    </p>
                  )}

                  {/* 항목 목록 */}
                  {expandedArchiveId === archive.id && (
                    <div className="divide-y divide-border">
                      {archive.items.length === 0 ? (
                        <p className="px-4 py-3 text-xs text-muted-foreground">담긴 콘텐츠가 없습니다.</p>
                      ) : (
                        archive.items.map((item) => (
                          <div
                            key={item.content_id ?? item.youtube_video_id}
                            className="flex items-start justify-between gap-2 px-4 py-3"
                          >
                            <div className="min-w-0 flex-1">
                              {item.contents ? (
                                <a
                                  href={`/dashboard/contents/${item.contents.id}`}
                                  className="line-clamp-1 text-sm font-medium text-foreground hover:text-brand-600"
                                >
                                  {item.contents.title}
                                </a>
                              ) : (
                                <span className="text-sm text-muted-foreground">(삭제된 콘텐츠)</span>
                              )}
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {item.contents?.category} ·{' '}
                                {new Date(item.added_at).toLocaleDateString('ko-KR')}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                handleRemoveItem(archive.id, item.content_id, item.youtube_video_id)
                              }
                              className="shrink-0 rounded p-1 text-muted-foreground/40 transition-colors hover:text-red-400"
                              title="목록에서 제거"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {archiveError && (
            <p className="mt-3 text-xs text-red-500">{archiveError}</p>
          )}
        </section>
      </div>
    </div>
  )
}
