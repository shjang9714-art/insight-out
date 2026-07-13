'use client'

import type { Dispatch, FormEvent, SetStateAction } from 'react'
import { Building2 } from 'lucide-react'
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
import type { Department } from '@/lib/types'
import { LENS_PRESETS, type LensKey } from '@/lib/lens'
import WatchlistSettingsModal from '@/components/watchlist/WatchlistSettingsModal'
import ServiceSettingsModal from './ServiceSettingsModal'
import type {
  NewsletterForm,
  ProfileForm,
  SaveStatus,
  ServiceOption,
  WatchlistSummaryItem,
} from './types'

const DEPARTMENTS: Department[] = [
  'Enterprise사업부문',
  'SMB사업부문',
  '공공사업부문',
  '기술부문',
  '마케팅부문',
  '기타',
]

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
  services: ServiceOption[]
  selectedServiceIds: string[]
  servicesStatus: SaveStatus
  servicesError: string | null
  onServicesSave: (nextIds: string[]) => Promise<boolean>
  watchlistItems: WatchlistSummaryItem[]
  onWatchlistChange: () => void
  lensStatus: SaveStatus
  lensError: string | null
  onDefaultLensChange: (nextLens: LensKey) => void
}

function SummaryChips({ labels, emptyLabel }: { labels: string[]; emptyLabel: string }) {
  if (labels.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {labels.slice(0, 8).map((label) => (
        <span
          key={label}
          className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground"
        >
          {label}
        </span>
      ))}
      {labels.length > 8 && (
        <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
          +{labels.length - 8}개
        </span>
      )}
    </div>
  )
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
  services,
  selectedServiceIds,
  servicesStatus,
  servicesError,
  onServicesSave,
  watchlistItems,
  onWatchlistChange,
  lensStatus,
  lensError,
  onDefaultLensChange,
}: Props) {
  const selectedServiceSet = new Set(selectedServiceIds)
  const selectedServices = services
    .filter((service) => selectedServiceSet.has(service.id))
    .map((service) => service.name)
  const watchlistLabels = watchlistItems.map((item) => item.company)

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
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="department">부문 <span className="text-negative">*</span></Label>
              <Select
                value={profile.department}
                onValueChange={(v) => setProfile({ ...profile, department: v as Department })}
              >
                <SelectTrigger id="department">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map((department) => (
                    <SelectItem key={department} value={department}>{department}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="team">팀 <span className="text-negative">*</span></Label>
              <Input
                id="team"
                value={profile.team}
                onChange={(e) => setProfile({ ...profile, team: e.target.value })}
                placeholder="예: 솔루션영업1팀"
              />
            </div>
          </div>

          {profileError && <p className="text-xs text-negative">{profileError}</p>}

          <Button type="submit" disabled={profileStatus === 'saving'} className="mt-1 h-10 w-full">
            {profileStatus === 'saving' ? '저장 중...' : profileStatus === 'saved' ? '저장되었습니다!' : '기본 정보 저장'}
          </Button>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-5 text-base font-semibold text-foreground">관심 설정</h2>

        <div className="space-y-3">
          <div className="rounded-lg border border-border p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-brand-600" />
                  <p className="text-sm font-semibold text-foreground">관심 기업 · {watchlistItems.length}개 선택됨</p>
                </div>
                <div className="mt-3">
                  <SummaryChips labels={watchlistLabels} emptyLabel="아직 선택한 관심 기업이 없습니다." />
                </div>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  📍 기업동향 · AI 인사이트에서 이 기업들의 소식을 모아 보여줍니다.
                </p>
              </div>
              <WatchlistSettingsModal
                onChange={onWatchlistChange}
                trigger={<Button type="button" variant="outline" size="sm">기업 설정</Button>}
              />
            </div>
          </div>

          <div className="rounded-lg border border-border p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">담당 서비스 · {selectedServiceIds.length}개 선택됨</p>
                <div className="mt-3">
                  <SummaryChips labels={selectedServices} emptyLabel="아직 선택한 담당 서비스가 없습니다." />
                </div>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  📍 콘텐츠 · 홈에서 내 서비스 관련 소식을 우선 보여줍니다.
                </p>
                {servicesError && <p className="mt-2 text-xs text-negative">{servicesError}</p>}
              </div>
              <ServiceSettingsModal
                services={services}
                selectedServiceIds={selectedServiceIds}
                status={servicesStatus}
                error={servicesError}
                onSave={onServicesSave}
                trigger={<Button type="button" variant="outline" size="sm">서비스 설정</Button>}
              />
            </div>
          </div>

          <div className="rounded-lg border border-border p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">기본 보기</p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  📍 콘텐츠 · AI 인사이트 · 기업동향을 열 때 이 기준으로 시작합니다. 화면에서 언제든 바꿀 수 있습니다.
                </p>
                {lensError && <p className="mt-2 text-xs text-negative">{lensError}</p>}
              </div>

              <div className="grid min-w-0 gap-2 sm:grid-cols-3 lg:w-[420px]">
                {(['mine', 'watch', 'all'] as const).map((key) => {
                  const isSelected = profile.default_lens === key
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onDefaultLensChange(key)}
                      disabled={lensStatus === 'saving'}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-left transition-all disabled:opacity-60',
                        isSelected
                          ? 'border-blue-500 bg-blue-50 text-blue-900'
                          : 'border-border bg-card text-foreground hover:border-border hover:bg-accent'
                      )}
                    >
                      <span className="block text-sm font-semibold">{LENS_PRESETS[key].label}</span>
                      <span className={cn('mt-0.5 block text-xs leading-snug', isSelected ? 'text-blue-700' : 'text-muted-foreground')}>
                        {LENS_PRESETS[key].desc}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
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
    </div>
  )
}
