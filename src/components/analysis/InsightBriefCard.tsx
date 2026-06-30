'use client'

import { Sparkles } from 'lucide-react'
import type { InsightBrief } from '@/lib/briefing/insight-brief'

interface Props {
  brief: InsightBrief
}

export default function InsightBriefCard({ brief }: Props) {
  const isEmpty = brief.keyChanges.length === 0 && brief.risks.length === 0 && brief.keywords.length === 0

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-brand-600 shrink-0" />
        <h2 className="text-sm font-semibold text-foreground">이번 주 AI 브리핑</h2>
      </div>

      {isEmpty ? (
        <p className="text-sm text-muted-foreground">이번 주 집계할 변화가 충분하지 않습니다.</p>
      ) : (
        <>
          {/* 핵심 변화 */}
          {brief.keyChanges.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70 mb-2">
                핵심 변화
              </p>
              <ol className="space-y-1.5">
                {brief.keyChanges.map((change, i) => (
                  <li key={i} className="flex gap-2 text-sm text-foreground">
                    <span className="shrink-0 text-[11px] font-bold text-brand-600 mt-0.5">{i + 1}</span>
                    <span className="leading-snug">{change}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* 주요 리스크 */}
          {brief.risks.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70 mb-2">
                주요 리스크
              </p>
              <ul className="space-y-1">
                {brief.risks.map((risk, i) => (
                  <li key={i} className="text-sm text-risk leading-snug">
                    {risk}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 주목 키워드 */}
          {brief.keywords.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70 mb-2">
                주목 키워드
              </p>
              <div className="flex flex-wrap gap-1.5">
                {brief.keywords.map((kw) => (
                  <span
                    key={kw}
                    className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 내 업무 시사점 */}
          {brief.myImplication && (
            <div className="rounded-lg border-l-2 border-brand-600/60 bg-brand-600/5 px-3 py-2">
              <p className="text-[11px] font-semibold text-brand-600 mb-0.5">내 업무 시사점</p>
              <p className="text-sm text-foreground leading-snug">{brief.myImplication}</p>
            </div>
          )}
        </>
      )}

      {/* 폴백 안내 (rule 기반일 때만) */}
      {brief.source === 'rule' && (
        <p className="text-[11px] text-muted-foreground/60 pt-1 border-t border-border">
          수집 데이터 기준으로 감지된 주요 변화입니다.
        </p>
      )}
    </div>
  )
}
