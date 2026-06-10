'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, KeyRound, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

type ProviderName = 'deepl' | 'papago' | 'google'

interface ProviderStatus {
  name: ProviderName
  configured: boolean
  enabled: boolean
  used: number
  limit: number
  remaining: number
}

interface TranslationStatusResponse {
  period: string
  providers: ProviderStatus[]
  error?: string
}

const PROVIDER_LABELS: Record<ProviderName, string> = {
  deepl: 'DeepL Free',
  papago: 'Papago',
  google: 'Google 번역',
}

const PROVIDER_ENV_NAMES: Record<ProviderName, string> = {
  deepl: 'DEEPL_API_KEY',
  papago: 'PAPAGO_CLIENT_ID / PAPAGO_CLIENT_SECRET',
  google: '키 불필요',
}

const NUMBER_FORMATTER = new Intl.NumberFormat('ko-KR')

export default function TranslationStatusManager() {
  const [period, setPeriod] = useState('')
  const [providers, setProviders] = useState<ProviderStatus[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [pendingProvider, setPendingProvider] = useState<ProviderName | null>(
    null
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isActive = true

    async function loadStatus() {
      try {
        const response = await fetch('/api/admin/translation-status', {
          cache: 'no-store',
        })
        const data = (await response.json()) as TranslationStatusResponse

        if (!response.ok) {
          throw new Error(data.error ?? '번역 상태를 불러오지 못했습니다.')
        }

        if (isActive) {
          setPeriod(data.period)
          setProviders(data.providers)
        }
      } catch (loadError) {
        if (isActive) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : '번역 상태를 불러오지 못했습니다.'
          )
        }
      } finally {
        if (isActive) setIsLoading(false)
      }
    }

    void loadStatus()
    return () => {
      isActive = false
    }
  }, [])

  async function toggleProvider(provider: ProviderStatus) {
    const nextEnabled = !provider.enabled
    setPendingProvider(provider.name)
    setError(null)

    try {
      const response = await fetch('/api/admin/translation-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: provider.name,
          enabled: nextEnabled,
        }),
      })
      const data = (await response.json()) as { error?: string }

      if (!response.ok) {
        throw new Error(data.error ?? '번역 설정을 저장하지 못했습니다.')
      }

      setProviders((current) =>
        current.map((item) =>
          item.name === provider.name
            ? { ...item, enabled: nextEnabled }
            : item
        )
      )
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : '번역 설정을 저장하지 못했습니다.'
      )
    } finally {
      setPendingProvider(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-40 items-center justify-center rounded-xl border border-border bg-card">
        <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
        <span className="ml-2 text-sm text-muted-foreground">번역 상태를 불러오는 중입니다.</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <p className="text-sm font-medium text-foreground">
            {period ? `${period} 사용량` : '이번 달 사용량'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            키 값은 표시하거나 저장하지 않으며 Vercel 환경변수로만 관리합니다.
          </p>
        </div>

        <div className="divide-y divide-border">
          {providers.map((provider) => {
            const isUnlimited = provider.name === 'google'
            const percentage = isUnlimited
              ? 0
              : Math.min((provider.used / provider.limit) * 100, 100)
            const isPending = pendingProvider === provider.name

            return (
              <div
                key={provider.name}
                className="grid gap-5 px-5 py-5 lg:grid-cols-[minmax(180px,0.8fr)_minmax(260px,1.4fr)_auto]"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-foreground">
                      {PROVIDER_LABELS[provider.name]}
                    </h2>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 text-xs font-medium',
                        provider.configured
                          ? 'text-green-700'
                          : 'text-muted-foreground'
                      )}
                    >
                      {provider.configured ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <span className="text-base leading-none">○</span>
                      )}
                      {provider.configured ? '연결됨' : '키 미설정'}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <KeyRound className="h-3.5 w-3.5" />
                    <span className="font-mono">
                      {PROVIDER_ENV_NAMES[provider.name]}
                    </span>
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">
                      {isUnlimited
                        ? `${NUMBER_FORMATTER.format(provider.used)}자 사용 / 제한 없음`
                        : `${NUMBER_FORMATTER.format(provider.used)} / ${NUMBER_FORMATTER.format(provider.limit)}자`}
                    </span>
                    <span className="font-medium text-foreground">
                      {isUnlimited
                        ? '최종 폴백'
                        : `${percentage.toFixed(1)}% · ${NUMBER_FORMATTER.format(provider.remaining)}자 남음`}
                    </span>
                  </div>
                  <Progress
                    value={percentage}
                    aria-label={`${PROVIDER_LABELS[provider.name]} 월간 사용량`}
                    className="h-2"
                  />
                </div>

                <div className="flex items-center justify-between gap-3 lg:justify-end">
                  <span
                    className={cn(
                      'text-xs font-medium',
                      provider.enabled ? 'text-green-700' : 'text-muted-foreground'
                    )}
                  >
                    {provider.enabled ? '사용 중' : '중지됨'}
                  </span>
                  <Button
                    type="button"
                    variant={provider.enabled ? 'outline' : 'default'}
                    disabled={isPending}
                    role="switch"
                    aria-checked={provider.enabled}
                    aria-label={`${PROVIDER_LABELS[provider.name]} 사용 여부`}
                    onClick={() => void toggleProvider(provider)}
                  >
                    {isPending && <Loader2 className="animate-spin" />}
                    {provider.enabled ? '끄기' : '켜기'}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
