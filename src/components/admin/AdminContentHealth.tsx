import Link from 'next/link'
import { HeartPulse } from 'lucide-react'
import { cn } from '@/lib/utils'
import AdminSectionHeader from '@/components/admin/ui/AdminSectionHeader'

export interface ContentHealth {
  total: number
  published: number
  bodyFull: number
  bodySnippet: number
  bodyNone: number
  bodyLenAvailable: boolean
  sentimentMissing: number
  untagged: number
  brokenLinks: number
  deadLinks: number
}

function pct(n: number, d: number) {
  return d > 0 ? Math.round((n / d) * 100) : 0
}

function HealthBar({ badPct }: { badPct: number }) {
  const barColor =
    badPct >= 60 ? 'bg-destructive'
    : badPct >= 30 ? 'bg-amber-500'
    : 'bg-brand-600'

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn('h-full rounded-full transition-all', barColor)}
        style={{ width: `${Math.min(badPct, 100)}%` }}
      />
    </div>
  )
}

interface RowProps {
  label: string
  value: string
  badPct: number
  linkHref: string
  linkLabel: string
  note?: string
}

function HealthRow({ label, value, badPct, linkHref, linkLabel, note }: RowProps) {
  const textColor =
    badPct >= 60 ? 'text-destructive'
    : badPct >= 30 ? 'text-amber-600'
    : 'text-muted-foreground'

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <div className="flex items-center gap-2 shrink-0">
	          <span className={cn('tabular-nums', textColor)}>{value}</span>
	          {/* prefetch-ok: 어드민 상태 카드 링크 — 개수 고정, 이동 잦음 */}
	          <Link
	            href={linkHref}
            className="rounded border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:border-brand-600 hover:text-brand-600 transition-colors"
          >
            {linkLabel}
          </Link>
        </div>
      </div>
      <HealthBar badPct={badPct} />
      {note && <p className="admin-caption text-muted-foreground">{note}</p>}
    </div>
  )
}

interface Props {
  health: ContentHealth
}

export default function AdminContentHealth({ health }: Props) {
  const {
    total, published,
    bodyFull, bodySnippet, bodyNone, bodyLenAvailable,
    sentimentMissing, untagged, brokenLinks, deadLinks,
  } = health

  // 본문 미보강 비율 (스니펫 + 미시도)
  const bodyBadCount = bodySnippet + bodyNone
  const bodyBadPct = pct(bodyBadCount, total)
  const bodyFullPct = pct(bodyFull, total)

  // 논조 미분류 비율 (published 기준)
  const sentimentPct = pct(sentimentMissing, published)

  // 태깅 누락 비율 (전체 기준)
  const untaggedPct = pct(untagged, total)

  const allGood =
    bodyBadPct === 0 &&
    sentimentPct === 0 &&
    untaggedPct === 0 &&
    brokenLinks === 0 &&
    deadLinks === 0

  return (
    <section aria-labelledby="content-health-heading">
      <AdminSectionHeader
        icon={HeartPulse}
        title="콘텐츠 건강"
        hint="수집 품질 — 보강이 필요한 항목을 한눈에"
      />

      {total === 0 ? (
        <p className="text-sm text-muted-foreground">수집된 콘텐츠가 없습니다.</p>
      ) : allGood ? (
        <p className="text-sm text-muted-foreground">
          콘텐츠 건강 양호 — 모든 지표가 기준 이내입니다. ✓
        </p>
      ) : (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">

          {/* 본문 풀텍스트 */}
          {bodyLenAvailable ? (
            <HealthRow
              label="본문 풀텍스트"
              value={`풀 ${bodyFullPct}% · 스니펫 ${pct(bodySnippet, total)}% · 미시도 ${pct(bodyNone, total)}% (${bodyBadCount.toLocaleString()}건 보강 가능)`}
              badPct={bodyBadPct}
              linkHref="/admin/contents"
              linkLabel="본문 보강"
            />
          ) : (
            <HealthRow
              label="본문 미시도"
              value={`${bodyNone.toLocaleString()}건`}
              badPct={pct(bodyNone, total)}
              linkHref="/admin/contents"
              linkLabel="본문 보강"
              note="body_len 컬럼 미적용 — 스니펫/풀 구분 불가"
            />
          )}

          {/* 논조 분류 */}
          <HealthRow
            label="논조 분류 (발행분)"
            value={`미분류 ${sentimentMissing.toLocaleString()}건 / ${published.toLocaleString()}건 (${sentimentPct}%)`}
            badPct={sentimentPct}
            linkHref="/admin/insights"
            linkLabel="논조 분석"
            note="야간 cron(149)이 자동으로 줄여줍니다."
          />

          {/* 태깅 */}
          <HealthRow
            label="태깅 (매칭그룹)"
            value={`누락 ${untagged.toLocaleString()}건 / ${total.toLocaleString()}건 (${untaggedPct}%)`}
            badPct={untaggedPct}
            linkHref="/admin/contents"
            linkLabel="신호 분류"
          />

          {/* 원문 링크 위험 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-foreground">원문 링크 위험</span>
              <div className="flex items-center gap-2 shrink-0">
                {brokenLinks === 0 && deadLinks === 0 ? (
                  <span className="text-muted-foreground">0건 ✓</span>
                ) : (
                  <span className="tabular-nums text-amber-600">
                    {brokenLinks > 0 && `구글뉴스 미해소 ${brokenLinks.toLocaleString()}건`}
                    {brokenLinks > 0 && deadLinks > 0 && ' · '}
                    {deadLinks > 0 && `죽은 링크 ${deadLinks.toLocaleString()}건`}
                  </span>
                )}
                <Link
                  href="/admin/contents"
                  className="rounded border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:border-brand-600 hover:text-brand-600 transition-colors"
                >
                  콘텐츠 관리
                </Link>
              </div>
            </div>
            {(brokenLinks > 0 || deadLinks > 0) && (
              <HealthBar badPct={pct(brokenLinks + deadLinks, published)} />
            )}
          </div>

        </div>
      )}
    </section>
  )
}
