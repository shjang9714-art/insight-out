'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
import type {
  Department,
  ContentFilterMode,
  NewsletterFrequency,
  Service,
} from '@/lib/types'
import type { Metadata } from 'next'

const DEPARTMENTS: Department[] = [
  'Enterprise사업부문',
  'SMB사업부문',
  '공공사업부문',
  '기술부문',
  '마케팅부문',
  '기타',
]

const FREQUENCY_OPTIONS: { value: NewsletterFrequency; label: string; description: string }[] = [
  { value: 'daily', label: '매일', description: '매일 오전 8시' },
  { value: 'twice_weekly', label: '주 2회', description: '화·목 오전 8시' },
  { value: 'weekly', label: '주 1회', description: '매주 월요일 오전 8시' },
  { value: 'none', label: '구독 안 함', description: '뉴스레터를 받지 않습니다' },
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
  frequency: NewsletterFrequency
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
    frequency: 'weekly',
    newsletter_email: '',
  })
  const [newsletterStatus, setNewsletterStatus] = useState<SaveStatus>('idle')
  const [newsletterError, setNewsletterError] = useState<string | null>(null)

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
      ] = await Promise.all([
        supabase.from('users').select('name, department, team, position, content_filter_mode').eq('id', user.id).single(),
        supabase.from('user_services').select('service_id').eq('user_id', user.id),
        supabase.from('services').select('*').order('order'),
        supabase.from('newsletter_subscriptions').select('frequency, newsletter_email').eq('user_id', user.id).single(),
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

      if (sub) {
        setNewsletter({
          frequency: (sub.frequency as NewsletterFrequency) ?? 'weekly',
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

    if (newsletter.frequency !== 'none') {
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

      const isActive = newsletter.frequency !== 'none'
      const { error } = await supabase
        .from('newsletter_subscriptions')
        .upsert(
          {
            user_id: user.id,
            frequency: newsletter.frequency,
            is_active: isActive,
            newsletter_email: isActive ? newsletter.newsletter_email.trim() : null,
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
        <p className="text-sm text-gray-400">불러오는 중...</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-gray-900">마이페이지</h1>
        <p className="mt-1 text-sm text-gray-500">{authEmail}</p>
      </div>

      <div className="space-y-6">
        {/* 프로필 정보 */}
        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-base font-semibold text-gray-900">프로필 정보</h2>

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

            <div className="grid grid-cols-2 gap-4">
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
                직책 <span className="text-xs font-normal text-gray-400">(선택)</span>
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
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
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
        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-gray-900">담당 서비스</h2>
            <p className="mt-1 text-xs text-gray-500">
              담당하거나 관심 있는 서비스를 선택하세요. 인사이동 시 여기서 업데이트하세요.
            </p>
          </div>

          {services.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">등록된 서비스가 없습니다.</p>
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
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                    )}
                  >
                    {svc.icon && <span className="text-lg">{svc.icon}</span>}
                    <span className="text-sm font-medium leading-tight">{svc.name}</span>
                    {svc.description && (
                      <span className="text-xs text-gray-400 line-clamp-1">{svc.description}</span>
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

        {/* 뉴스레터 설정 */}
        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-base font-semibold text-gray-900">뉴스레터 설정</h2>

          <form onSubmit={handleNewsletterSave} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>수신 주기</Label>
              <div className="grid grid-cols-2 gap-2">
                {FREQUENCY_OPTIONS.map((opt) => {
                  const isSelected = newsletter.frequency === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setNewsletter({ ...newsletter, frequency: opt.value })}
                      className={cn(
                        'flex flex-col gap-0.5 rounded-xl border p-3 text-left transition-all',
                        isSelected
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                      )}
                    >
                      <span className={cn('text-sm font-semibold', isSelected ? 'text-blue-900' : 'text-gray-800')}>
                        {opt.label}
                      </span>
                      <span className={cn('text-xs', isSelected ? 'text-blue-700' : 'text-gray-400')}>
                        {opt.description}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {newsletter.frequency !== 'none' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="newsletter-email">
                  수신 이메일 <span className="text-red-500">*</span>
                </Label>
                <p className="text-xs text-gray-500">Gmail 또는 사내 이메일로 받아보실 수 있습니다.</p>
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
      </div>
    </div>
  )
}
