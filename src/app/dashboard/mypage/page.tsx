'use client'

import { useEffect, useState, type FormEvent } from 'react'
import BackLink from '@/components/BackLink'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import PageContainer from '@/components/PageContainer'
import SettingsTab from '@/components/mypage/SettingsTab'
import BookmarksTab from '@/components/mypage/BookmarksTab'
import ArchivesTab from '@/components/mypage/ArchivesTab'
import { saveDefaultLens, saveProfile } from '@/app/dashboard/mypage/actions'
import type { Department } from '@/lib/types'
import type { LensKey } from '@/lib/lens'
import type {
  ArchiveWithItems,
  BookmarkWithItem,
  MyPageTab,
  NewsletterForm,
  ProfileForm,
  SaveStatus,
  ServiceOption,
  WatchlistSummaryItem,
} from '@/components/mypage/types'

const TABS: { id: MyPageTab; label: string }[] = [
  { id: 'settings', label: '설정' },
  { id: 'bookmarks', label: '북마크' },
  { id: 'archives', label: '아카이브' },
]

export default function MyPage() {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<MyPageTab>('settings')
  const [authEmail, setAuthEmail] = useState('')

  const [profile, setProfile] = useState<ProfileForm>({
    name: '',
    department: '기타',
    team: '',
    default_lens: 'all',
  })
  const [profileStatus, setProfileStatus] = useState<SaveStatus>('idle')
  const [profileError, setProfileError] = useState<string | null>(null)
  const [lensStatus, setLensStatus] = useState<SaveStatus>('idle')
  const [lensError, setLensError] = useState<string | null>(null)

  const [services, setServices] = useState<ServiceOption[]>([])
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<string>>(new Set())
  const [servicesStatus, setServicesStatus] = useState<SaveStatus>('idle')
  const [servicesError, setServicesError] = useState<string | null>(null)

  const [watchlistItems, setWatchlistItems] = useState<WatchlistSummaryItem[]>([])

  const [newsletter, setNewsletter] = useState<NewsletterForm>({
    is_active: true,
    newsletter_email: '',
  })
  const [newsletterStatus, setNewsletterStatus] = useState<SaveStatus>('idle')
  const [newsletterError, setNewsletterError] = useState<string | null>(null)

  const [bookmarks, setBookmarks] = useState<BookmarkWithItem[]>([])
  const [bookmarksLoading, setBookmarksLoading] = useState(true)
  const [bookmarkError, setBookmarkError] = useState<string | null>(null)

  const [archives, setArchives] = useState<ArchiveWithItems[]>([])
  const [archivesLoading, setArchivesLoading] = useState(true)
  const [expandedArchiveId, setExpandedArchiveId] = useState<string | null>(null)
  const [archiveError, setArchiveError] = useState<string | null>(null)
  const [sendingArchiveId, setSendingArchiveId] = useState<string | null>(null)
  const [sendResult, setSendResult] = useState<{ archiveId: string; to: string } | null>(null)
  const [emailInputArchiveId, setEmailInputArchiveId] = useState<string | null>(null)
  const [emailInputValue, setEmailInputValue] = useState('')

  async function fetchWatchlistForUser(userId: string): Promise<WatchlistSummaryItem[]> {
    const { data, error } = await supabase
      .from('user_watchlist')
      .select('id, company, entity_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(20)

    if (error?.code === '42703') {
      const { data: fallback } = await supabase
        .from('user_watchlist')
        .select('id, company')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(20)
      return ((fallback ?? []) as { id: string; company: string }[]).map((row) => ({
        ...row,
        entity_id: null,
      }))
    }

    if (error) {
      console.warn('[mypage] 관심 기업 요약 조회 실패:', error.message)
      return []
    }

    return (data ?? []) as WatchlistSummaryItem[]
  }

  async function refreshWatchlistSummary() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setWatchlistItems(await fetchWatchlistForUser(user.id))
  }

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      setAuthEmail(user.email ?? '')

      const [
        userRes,
        userServicesRes,
        allServicesRes,
        subRes,
        bookmarksRes,
        archivesRes,
        watchlistRows,
      ] = await Promise.all([
        supabase.from('users').select('name, department, team, default_lens').eq('id', user.id).single(),
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
        fetchWatchlistForUser(user.id),
      ])

      let userRow = userRes.data
      if (userRes.error?.code === '42703') {
        const { data: fallback } = await supabase
          .from('users')
          .select('name, department, team')
          .eq('id', user.id)
          .single()
        userRow = fallback ? { ...fallback, default_lens: 'all' as LensKey } : null
      }

      if (userRow) {
        setProfile({
          name: userRow.name ?? '',
          department: (userRow.department as Department) ?? '기타',
          team: userRow.team ?? '',
          default_lens: (userRow.default_lens as LensKey) ?? 'all',
        })
      }

      if (allServicesRes.data) setServices(allServicesRes.data as ServiceOption[])
      if (userServicesRes.data) setSelectedServiceIds(new Set(userServicesRes.data.map((row) => row.service_id)))
      setWatchlistItems(watchlistRows)

      if (bookmarksRes.error) setBookmarkError('북마크를 불러오지 못했습니다.')
      if (bookmarksRes.data) setBookmarks(bookmarksRes.data as unknown as BookmarkWithItem[])
      setBookmarksLoading(false)

      if (archivesRes.error) setArchiveError('아카이브를 불러오지 못했습니다.')
      if (archivesRes.data) setArchives(archivesRes.data as unknown as ArchiveWithItems[])
      setArchivesLoading(false)

      if (subRes.data) {
        setNewsletter({
          is_active: subRes.data.is_active ?? true,
          newsletter_email: subRes.data.newsletter_email ?? (user.email ?? ''),
        })
      } else {
        setNewsletter((prev) => ({ ...prev, newsletter_email: user.email ?? '' }))
      }

      const hash = window.location.hash.slice(1)
      if (hash === 'bookmarks' || hash === 'archives') setActiveTab(hash)

      setLoading(false)
    }

    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleTabChange = (tab: MyPageTab) => {
    setActiveTab(tab)
    const hash = tab === 'settings' ? '' : `#${tab}`
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`)
  }

  const handleProfileSave = async (e: FormEvent) => {
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
      const result = await saveProfile({
        name: profile.name,
        department: profile.department,
        team: profile.team,
      })
      if (result.error) throw new Error(result.error)

      setProfileStatus('saved')
      setTimeout(() => setProfileStatus('idle'), 2500)
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : '오류가 발생했습니다.')
      setProfileStatus('error')
    }
  }

  const handleDefaultLensChange = async (nextLens: LensKey) => {
    if (nextLens === profile.default_lens) return

    const previousLens = profile.default_lens
    setProfile((prev) => ({ ...prev, default_lens: nextLens }))
    setLensError(null)
    setLensStatus('saving')

    try {
      const result = await saveDefaultLens(nextLens)
      if (result.error) throw new Error(result.error)

      try {
        localStorage.setItem('io:lens', nextLens)
        window.dispatchEvent(new Event('lens:changed'))
      } catch { /* noop */ }

      setLensStatus('saved')
      setTimeout(() => setLensStatus('idle'), 2500)
    } catch (err) {
      setProfile((prev) => ({ ...prev, default_lens: previousLens }))
      setLensError(err instanceof Error ? err.message : '오류가 발생했습니다.')
      setLensStatus('error')
    }
  }

  const handleServicesSave = async (nextIds: string[]): Promise<boolean> => {
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

      if (nextIds.length > 0) {
        const rows = nextIds.map((service_id) => ({
          user_id: user.id,
          service_id,
          is_pinned: false,
        }))
        const { error: insertError } = await supabase.from('user_services').insert(rows)
        if (insertError) throw new Error(`저장 실패: ${insertError.message}`)
      }

      setSelectedServiceIds(new Set(nextIds))
      setServicesStatus('saved')
      setTimeout(() => setServicesStatus('idle'), 2500)
      return true
    } catch (err) {
      setServicesError(err instanceof Error ? err.message : '오류가 발생했습니다.')
      setServicesStatus('error')
      return false
    }
  }

  const handleNewsletterSave = async (e: FormEvent) => {
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

  async function handleRemoveBookmark(bookmarkId: string) {
    setBookmarkError(null)
    const { error } = await supabase.from('bookmarks').delete().eq('id', bookmarkId)
    if (error) {
      setBookmarkError('북마크 해제에 실패했습니다. 잠시 후 다시 시도해주세요.')
    } else {
      setBookmarks((prev) => prev.filter((bookmark) => bookmark.id !== bookmarkId))
    }
  }

  async function handleDeleteArchive(archiveId: string) {
    if (!window.confirm('아카이브를 삭제하면 담긴 항목도 모두 사라집니다. 계속할까요?')) return
    setArchiveError(null)
    const { error } = await supabase.from('archives').delete().eq('id', archiveId)
    if (error) {
      setArchiveError('삭제에 실패했습니다. 잠시 후 다시 시도해주세요.')
    } else {
      setArchives((prev) => prev.filter((archive) => archive.id !== archiveId))
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
        prev.map((archive) =>
          archive.id === archiveId
            ? {
                ...archive,
                items: archive.items.filter((item) =>
                  contentId ? item.content_id !== contentId : item.youtube_video_id !== youtubeId
                ),
              }
            : archive
        )
      )
    }
  }

  async function handleSendEmail(archiveId: string, recipientsInput?: string) {
    setSendingArchiveId(archiveId)
    setArchiveError(null)
    setSendResult(null)
    const recipients = recipientsInput
      ? recipientsInput.split(/[,;\s]+/).map((email) => email.trim()).filter(Boolean)
      : []

    try {
      const res = await fetch('/api/email/send-archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archiveId, recipients }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '발송에 실패했습니다.')
      setSendResult({ archiveId, to: data.to })
      setEmailInputArchiveId(null)
      setEmailInputValue('')
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
    <PageContainer variant="reading">
      <div className="mb-8">
        <BackLink
          fallbackHref="/dashboard"
          className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-brand-600"
        />
        <h1 className="text-xl font-bold text-foreground">마이페이지</h1>
        <p className="mt-1 text-sm text-muted-foreground">{authEmail}</p>
      </div>

      <div className="mb-6 flex items-center gap-5 border-b border-border">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                'border-b-2 px-0.5 pb-2 text-sm font-medium transition-colors',
                isActive
                  ? 'border-brand-600 text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {activeTab === 'settings' && (
        <SettingsTab
          authEmail={authEmail}
          profile={profile}
          setProfile={setProfile}
          profileStatus={profileStatus}
          profileError={profileError}
          onProfileSave={handleProfileSave}
          newsletter={newsletter}
          setNewsletter={setNewsletter}
          newsletterStatus={newsletterStatus}
          newsletterError={newsletterError}
          onNewsletterSave={handleNewsletterSave}
          services={services}
          selectedServiceIds={Array.from(selectedServiceIds)}
          servicesStatus={servicesStatus}
          servicesError={servicesError}
          onServicesSave={handleServicesSave}
          watchlistItems={watchlistItems}
          onWatchlistChange={refreshWatchlistSummary}
          lensStatus={lensStatus}
          lensError={lensError}
          onDefaultLensChange={handleDefaultLensChange}
        />
      )}

      {activeTab === 'bookmarks' && (
        <BookmarksTab
          bookmarks={bookmarks}
          loading={bookmarksLoading}
          error={bookmarkError}
          onRemove={handleRemoveBookmark}
        />
      )}

      {activeTab === 'archives' && (
        <ArchivesTab
          archives={archives}
          loading={archivesLoading}
          error={archiveError}
          expandedArchiveId={expandedArchiveId}
          setExpandedArchiveId={setExpandedArchiveId}
          sendingArchiveId={sendingArchiveId}
          sendResult={sendResult}
          emailInputArchiveId={emailInputArchiveId}
          setEmailInputArchiveId={setEmailInputArchiveId}
          emailInputValue={emailInputValue}
          setEmailInputValue={setEmailInputValue}
          defaultEmail={authEmail}
          onDeleteArchive={handleDeleteArchive}
          onRemoveItem={handleRemoveItem}
          onSendEmail={handleSendEmail}
          clearSendResult={() => setSendResult(null)}
        />
      )}
    </PageContainer>
  )
}
