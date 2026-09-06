'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import BackLink from '@/components/BackLink'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import PageContainer from '@/components/PageContainer'
import SettingsTab from '@/components/mypage/SettingsTab'
import { saveProfile } from '@/app/dashboard/mypage/actions'
import type { Department } from '@/lib/types'
import { FIXED_DEPARTMENT, isOrgGroup } from '@/lib/org'
import type { LensKey } from '@/lib/lens'
import type {
  NewsletterForm,
  ProfileForm,
  SaveStatus,
  WatchlistSummaryItem,
} from '@/components/mypage/types'

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
        watchlistRows,
      ] = await Promise.all([
        supabase.from('users').select('name, department, team, team_name, default_lens').eq('id', user.id).single(),
        supabase.from('newsletter_subscriptions').select('is_active, newsletter_email').eq('user_id', user.id).single(),
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
            userRow.default_lens === 'boost' || userRow.default_lens === 'only' || userRow.default_lens === 'all'
              ? userRow.default_lens
              : 'all',
        })
      }

      setWatchlistItems(watchlistRows)

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
    // 북마크는 /dashboard/bookmarks 전용 페이지로 분리(아카이브는 517에서 북마크로 통합·제거됨).
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
        </div>
      </div>
    </PageContainer>
  )
}
