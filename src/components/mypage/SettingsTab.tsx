'use client'

import { startTransition, useEffect, useState } from 'react'
import type { Dispatch, FormEvent, SetStateAction } from 'react'
import { useTheme } from 'next-themes'
import InterestManager from '@/components/interests/InterestManager'
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
import { DEPARTMENT_DISPLAY_LABEL, ORG_GROUPS, isOrgGroup } from '@/lib/org'
import type {
  NewsletterForm,
  ProfileForm,
  SaveStatus,
  WatchlistSummaryItem,
} from './types'

interface Props {
  authEmail: string
  profile: ProfileForm
  setProfile: Dispatch<SetStateAction<ProfileForm>>
  profileStatus: SaveStatus
  profileError: string | null
  onProfileSave: (e: FormEvent) => void
  newsletter: NewsletterForm
  setNewsletter: Dispatch<SetStateAction<NewsletterForm>>
  newsletterStatus: SaveStatus
  newsletterError: string | null
  onNewsletterSave: (e: FormEvent) => void
  watchlistItems: WatchlistSummaryItem[]
  onWatchlistChange: () => void
}

export default function SettingsTab({
  authEmail,
  profile,
  setProfile,
  profileStatus,
  profileError,
  onProfileSave,
  newsletter,
  setNewsletter,
  newsletterStatus,
  newsletterError,
  onNewsletterSave,
}: Props) {
  const [mounted, setMounted] = useState(false)
  const { resolvedTheme, setTheme } = useTheme()

  useEffect(() => {
    startTransition(() => setMounted(true))
  }, [])

  const isDarkMode = resolvedTheme === 'dark'

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-5 text-base font-semibold text-foreground">기본 정보</h2>

        <form onSubmit={onProfileSave} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">이름 <span className="text-negative">*</span></Label>
              <Input
                id="name"
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                placeholder="홍길동"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">이메일</Label>
              <Input id="email" value={authEmail} readOnly className="bg-muted text-muted-foreground" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* 347: 부문은 Ent 부문 단일 — 선택 대상이 아니라 고정 표기 */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="department">부문</Label>
              <Input
                id="department"
                value={DEPARTMENT_DISPLAY_LABEL}
                readOnly
                className="bg-muted text-muted-foreground"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="team">그룹 <span className="text-negative">*</span></Label>
              <Select
                value={isOrgGroup(profile.team) ? profile.team : undefined}
                onValueChange={(v) => setProfile({ ...profile, team: v })}
              >
                <SelectTrigger id="team">
                  <SelectValue placeholder="그룹을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {ORG_GROUPS.map((group) => (
                    <SelectItem key={group} value={group}>{group}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="team_name">팀 이름 <span className="text-negative">*</span></Label>
            <Input
              id="team_name"
              value={profile.team_name}
              onChange={(e) => setProfile({ ...profile, team_name: e.target.value })}
              placeholder="예: 클라우드사업팀"
            />
          </div>

          {profileError && <p className="text-xs text-negative">{profileError}</p>}

          <Button type="submit" disabled={profileStatus === 'saving'} className="mt-1 h-10 w-full">
            {profileStatus === 'saving' ? '저장 중...' : profileStatus === 'saved' ? '저장되었습니다!' : '기본 정보 저장'}
          </Button>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-5 text-base font-semibold text-foreground">내 관심사</h2>
        <InterestManager />
      </section>

      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-5 text-base font-semibold text-foreground">알림 설정</h2>

        <form onSubmit={onNewsletterSave} className="flex flex-col gap-4">
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div>
              <p className="text-sm font-medium text-foreground">뉴스레터 수신</p>
              <p className="mt-0.5 text-xs text-muted-foreground">어드민 설정 일정에 따라 발송됩니다.</p>
            </div>
            <button
              type="button"
              onClick={() => setNewsletter({ ...newsletter, is_active: !newsletter.is_active })}
              className={cn(
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                newsletter.is_active ? 'bg-brand-solid' : 'bg-muted'
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
              <Label htmlFor="newsletter-email">수신 이메일 <span className="text-negative">*</span></Label>
              <Input
                id="newsletter-email"
                type="email"
                value={newsletter.newsletter_email}
                onChange={(e) => {
                  setNewsletter({ ...newsletter, newsletter_email: e.target.value })
                }}
                placeholder="예: name@lguplus.co.kr"
              />
            </div>
          )}

          {newsletterError && <p className="text-xs text-negative">{newsletterError}</p>}

          <Button type="submit" disabled={newsletterStatus === 'saving'} className="mt-1 h-10 w-full">
            {newsletterStatus === 'saving' ? '저장 중...' : newsletterStatus === 'saved' ? '저장되었습니다!' : '알림 설정 저장'}
          </Button>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-5 text-base font-semibold text-foreground">화면 설정</h2>

        <div className="flex items-center justify-between rounded-lg border border-border p-4">
          <div>
            <p className="text-sm font-medium text-foreground">다크 모드</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              어두운 환경에서 눈의 피로를 줄이는 화면으로 전환합니다.
            </p>
          </div>
          {mounted ? (
            <button
              type="button"
              onClick={() => setTheme(isDarkMode ? 'light' : 'dark')}
              className={cn(
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                isDarkMode ? 'bg-brand-solid' : 'bg-muted'
              )}
              role="switch"
              aria-checked={isDarkMode}
              aria-label="다크 모드"
            >
              <span
                className={cn(
                  'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
                  isDarkMode ? 'translate-x-5' : 'translate-x-0'
                )}
              />
            </button>
          ) : (
            <div className="h-6 w-11 shrink-0" aria-hidden="true" />
          )}
        </div>
      </section>
    </div>
  )
}
