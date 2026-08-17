'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import BackLink from '@/components/BackLink'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import PageContainer from '@/components/PageContainer'
import SettingsTab from '@/components/mypage/SettingsTab'
import BookmarksTab from '@/components/mypage/BookmarksTab'
import { saveProfile } from '@/app/dashboard/mypage/actions'
import type { Department } from '@/lib/types'
import { FIXED_DEPARTMENT, isOrgGroup } from '@/lib/org'
import type { LensKey } from '@/lib/lens'
import type {
  BookmarkWithItem,
  NewsletterForm,
  ProfileForm,
  SaveStatus,
  WatchlistSummaryItem,
} from '@/components/mypage/types'

// 492 · 3단계 D — 소프트 삭제된 콘텐츠는 "삭제된 콘텐츠" 표시 없이 목록에서 조용히 감춘다.
// SQL B(RLS) 적용 후에는 contents 가 null 로 오지만, 그 전(또는 admin 조회 등)에는
// deleted_at 이 채워진 채로 올 수 있어 두 경우 다 걸러야 카운트·목록이 어긋나지 않는다.
type ContentsJoin = { deleted_at?: string | null } | null

function isLiveContentJoin(contentId: string | null, contents: ContentsJoin): boolean {
  if (!contentId) return true // content_id 아닌 다른 타겟 기반 항목은 무관
  return Boolean(contents) && !contents!.deleted_at
}

function filterDeletedBookmarks(rows: BookmarkWithItem[]): BookmarkWithItem[] {
  return rows.filter((row) => isLiveContentJoin(row.content_id, row.contents as ContentsJoin))
}

export default function MyPage() {
  const supabase = createClient()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [authEmail, setAuthEmail] = useState('')

  const [profile, setProfile] = useState<ProfileForm>({
    name: '',
    department: FIXED_DEPARTMENT,
    team: '',
    team_name: '',
    default_lens: 'all',
  })
  const [profileStatus, setProfileStatus] = useState<SaveStatus>('idle')
  const [profileError, setProfileError] = useState<string | null>(null)

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

  // 517 — 아카이브를 없애고 북마크 하나로 합치며, 다중 선택 → 메일 발송을 북마크 쪽으로 옮겼다.
  const [selectedBookmarkIds, setSelectedBookmarkIds] = useState<Set<string>>(new Set())
  const [emailInputOpen, setEmailInputOpen] = useState(false)
  const [emailInputValue, setEmailInputValue] = useState('')
  const [sendingBookmarks, setSendingBookmarks] = useState(false)
  const [sendResult, setSendResult] = useState<{ to: string } | null>(null)

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
        subRes,
        bookmarksRes,
        watchlistRows,
      ] = await Promise.all([
        supabase.from('users').select('name, department, team, team_name, default_lens').eq('id', user.id).single(),
        supabase.from('newsletter_subscriptions').select('is_active, newsletter_email').eq('user_id', user.id).single(),
        supabase
          .from('bookmarks')
          .select(`
            id, content_id, youtube_video_id, ai_report_id, daily_insight_id, insight_card_id, created_at,
            contents(id, title, category, original_url, published_at, deleted_at),
            youtube_videos(id, video_id, title, channel_name, published_at),
            ai_reports(id, title, type, published_at),
            daily_insights(id, headline, category, day_of),
            insight_cards(id, topic, headline, card_headline, generated_at)
          `)
          .order('created_at', { ascending: false }),
        fetchWatchlistForUser(user.id),
      ])

      let userRow = userRes.data
      if (userRes.error?.code === '42703') {
        const { data: fallback } = await supabase
          .from('users')
          .select('name, department, team, team_name')
          .eq('id', user.id)
          .single()
        userRow = fallback ? { ...fallback, default_lens: 'all' as LensKey } : null
      }

      if (userRow) {
        setProfile({
          name: userRow.name ?? '',
          department: (userRow.department as Department) ?? '기타',
          team: userRow.team ?? '',
          team_name: userRow.team_name ?? '',
          default_lens:
            userRow.default_lens === 'watch' || userRow.default_lens === 'all'
              ? userRow.default_lens
              : 'all',
        })
      }

      setWatchlistItems(watchlistRows)

      if (bookmarksRes.error) setBookmarkError('북마크를 불러오지 못했습니다.')
      if (bookmarksRes.data) setBookmarks(filterDeletedBookmarks(bookmarksRes.data as unknown as BookmarkWithItem[]))
      setBookmarksLoading(false)

      if (subRes.data) {
        setNewsletter({
          is_active: subRes.data.is_active ?? true,
          newsletter_email: subRes.data.newsletter_email ?? (user.email ?? ''),
        })
      } else {
        setNewsletter((prev) => ({ ...prev, newsletter_email: user.email ?? '' }))
      }

      setLoading(false)
    }

    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const handleProfileSave = async (e: FormEvent) => {
    e.preventDefault()

    if (!profile.name.trim()) {
      setProfileError('이름을 입력해주세요.')
      return
    }
    if (!isOrgGroup(profile.team)) {
      setProfileError('그룹을 선택해주세요.')
      return
    }
    if (!profile.team_name.trim()) {
      setProfileError('팀 이름을 입력해주세요.')
      return
    }

    setProfileError(null)
    setProfileStatus('saving')

    try {
      // 347: 부문은 서버에서 FIXED_DEPARTMENT 로 고정 저장 — 클라이언트가 보내지 않는다
      const result = await saveProfile({
        name: profile.name,
        team: profile.team,
        team_name: profile.team_name,
      })
      if (result.error) throw new Error(result.error)

      setProfileStatus('saved')
      setTimeout(() => setProfileStatus('idle'), 2500)
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : '오류가 발생했습니다.')
      setProfileStatus('error')
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
      setSelectedBookmarkIds((prev) => {
        if (!prev.has(bookmarkId)) return prev
        const next = new Set(prev)
        next.delete(bookmarkId)
        return next
      })
    }
  }

  function handleToggleSelectBookmark(bookmarkId: string) {
    setSelectedBookmarkIds((prev) => {
      const next = new Set(prev)
      if (next.has(bookmarkId)) next.delete(bookmarkId)
      else next.add(bookmarkId)
      return next
    })
  }

  function handleToggleSelectAllBookmarks() {
    setSelectedBookmarkIds((prev) =>
      prev.size === bookmarks.length ? new Set() : new Set(bookmarks.map((b) => b.id))
    )
  }

  function handleOpenEmailInput() {
    setEmailInputValue(authEmail)
    setSendResult(null)
    setBookmarkError(null)
    setEmailInputOpen(true)
  }

  async function handleSendBookmarkEmail() {
    setSendingBookmarks(true)
    setBookmarkError(null)
    setSendResult(null)
    const recipients = emailInputValue
      ? emailInputValue.split(/[,;\s]+/).map((email) => email.trim()).filter(Boolean)
      : []

    try {
      const res = await fetch('/api/email/send-bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookmarkIds: [...selectedBookmarkIds], recipients }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '발송에 실패했습니다.')
      setSendResult({ to: data.to })
      setEmailInputOpen(false)
      setEmailInputValue('')
    } catch (err) {
      setBookmarkError(err instanceof Error ? err.message : '이메일 발송에 실패했습니다.')
    } finally {
      setSendingBookmarks(false)
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
    // 347: 마이페이지는 목록 화면과 성격이 다른 "설정 패널" — 중앙 정렬(mx-auto).
    // 폭은 다른 화면(max-w-screen-xl)까지 늘리지 않는다 — 입력 필드·폼이 1200px로 늘어지면 읽기·조작이 불편해진다.
    // 탭(설정/북마크/아카이브)은 제거하고 한 화면 스크롤로 통합.
    <PageContainer>
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8">
          <BackLink
            fallbackHref="/dashboard"
            className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-brand-600"
          />
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-foreground">마이페이지</h1>
              <p className="mt-1 text-sm text-muted-foreground">{authEmail}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="shrink-0 gap-1.5 text-muted-foreground hover:text-negative"
            >
              <LogOut className="h-3.5 w-3.5" />
              로그아웃
            </Button>
          </div>
        </div>

        <div className="space-y-10">
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
            watchlistItems={watchlistItems}
            onWatchlistChange={refreshWatchlistSummary}
          />

          <BookmarksTab
            bookmarks={bookmarks}
            loading={bookmarksLoading}
            error={bookmarkError}
            onRemove={handleRemoveBookmark}
            selectedIds={selectedBookmarkIds}
            onToggleSelect={handleToggleSelectBookmark}
            onToggleSelectAll={handleToggleSelectAllBookmarks}
            emailInputOpen={emailInputOpen}
            onOpenEmailInput={handleOpenEmailInput}
            onCloseEmailInput={() => setEmailInputOpen(false)}
            emailInputValue={emailInputValue}
            setEmailInputValue={setEmailInputValue}
            sending={sendingBookmarks}
            sendResult={sendResult}
            onSendEmail={handleSendBookmarkEmail}
          />
        </div>
      </div>
    </PageContainer>
  )
}
