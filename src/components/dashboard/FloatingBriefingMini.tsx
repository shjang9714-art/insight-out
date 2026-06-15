'use client'

import { useState, useEffect, useRef, startTransition } from 'react'
import Link from 'next/link'
import { Radio, X, Play, Pause, ChevronDown, ChevronUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface Briefing {
  id: string
  briefing_date: string
  title: string | null
  script: string | null
  audio_url: string | null
  audio_duration_seconds: number | null
}

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function dateLabel(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('ko-KR', {
    month: 'long', day: 'numeric', weekday: 'short',
  })
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function FloatingBriefingMini() {
  const [open, setOpen]             = useState(false)
  const [briefing, setBriefing]     = useState<Briefing | null | undefined>(undefined)
  const [playing, setPlaying]       = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration]     = useState(0)
  const [scriptOpen, setScriptOpen] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const cardRef  = useRef<HTMLDivElement>(null)

  // 최신 브리핑 1건 조회 (최초 1회)
  useEffect(() => {
    createClient()
      .from('briefings')
      .select('id, briefing_date, title, script, audio_url, audio_duration_seconds')
      .in('status', ['published', 'archived'])
      .order('briefing_date', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => startTransition(() => setBriefing(data as Briefing | null)))
  }, [])

  // 오디오 인스턴스 관리
  useEffect(() => {
    if (!briefing?.audio_url) {
      startTransition(() => {
        setCurrentTime(0)
        setDuration(briefing?.audio_duration_seconds ?? 0)
      })
      return
    }
    const audio = new Audio(briefing.audio_url)
    audioRef.current = audio
    if (briefing.audio_duration_seconds) startTransition(() => setDuration(briefing.audio_duration_seconds!))
    audio.addEventListener('loadedmetadata', () => setDuration(audio.duration || briefing.audio_duration_seconds || 0))
    audio.addEventListener('timeupdate', () => setCurrentTime(audio.currentTime))
    audio.addEventListener('ended', () => { setPlaying(false); setCurrentTime(0) })
    return () => {
      audio.pause()
      audioRef.current = null
      setPlaying(false)
      setCurrentTime(0)
    }
  }, [briefing?.audio_url, briefing?.audio_duration_seconds])

  // 플레이어 닫힐 때 오디오 정지
  useEffect(() => {
    if (!open && audioRef.current) {
      audioRef.current.pause()
      setPlaying(false)
    }
  }, [open])

  // 외부 클릭 시 닫기
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function togglePlay() {
    if (!audioRef.current) return
    if (playing) { audioRef.current.pause(); setPlaying(false) }
    else { audioRef.current.play(); setPlaying(true) }
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    if (!audioRef.current || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    audioRef.current.currentTime = ratio * duration
  }

  const progress  = duration > 0 ? currentTime / duration : 0
  const hasAudio  = !!briefing?.audio_url
  const isLoading = briefing === undefined

  return (
    <div ref={cardRef} className="fixed bottom-6 right-6 z-50">
      {/* ── 확장된 미니 플레이어 ─────────────────────────────────────────── */}
      {open && (
        <div className="mb-3 w-72 rounded-2xl border border-border bg-card shadow-xl ring-1 ring-black/5">
          {/* 헤더 */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-brand-600" />
              <span className="text-sm font-semibold text-foreground">오늘의 브리핑</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent"
              aria-label="닫기"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* 본문 */}
          <div className="px-4 py-3">
            {isLoading ? (
              <div className="space-y-2 py-2">
                <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
              </div>
            ) : !briefing ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                오늘 브리핑이 아직 없습니다
              </p>
            ) : (
              <>
                {/* 날짜·제목 */}
                <p className="text-[11px] text-muted-foreground">{dateLabel(briefing.briefing_date)}</p>
                <p className="mt-0.5 line-clamp-2 text-xs font-medium leading-snug text-foreground">
                  {briefing.title ?? '모닝브리핑'}
                </p>

                {/* 오디오 플레이어 */}
                {hasAudio ? (
                  <div className="mt-3 space-y-2">
                    {/* 진행 바 — 클릭으로 탐색 */}
                    <div
                      role="slider"
                      aria-label="재생 위치"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(progress * 100)}
                      tabIndex={0}
                      className="relative h-1.5 cursor-pointer rounded-full bg-muted"
                      onClick={handleSeek}
                    >
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-brand-600 transition-all"
                        style={{ width: `${progress * 100}%` }}
                      />
                    </div>

                    {/* 시간 + 재생버튼 */}
                    <div className="flex items-center justify-between">
                      <span className="tabular-nums text-[11px] text-muted-foreground">
                        {formatTime(currentTime)} / {duration > 0 ? formatTime(duration) : '--:--'}
                      </span>
                      <button
                        onClick={togglePlay}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white transition-colors hover:bg-brand-700"
                        aria-label={playing ? '일시정지' : '재생'}
                      >
                        {playing
                          ? <Pause className="h-3.5 w-3.5" />
                          : <Play className="h-3.5 w-3.5 pl-0.5" />
                        }
                      </button>
                    </div>
                  </div>
                ) : (
                  /* 오디오 없음 — 스크립트 폴백 */
                  <div className="mt-3">
                    <p className="mb-1 text-[11px] text-muted-foreground">오디오 생성 전 · 스크립트만 제공</p>
                    {briefing.script ? (
                      <>
                        <button
                          onClick={() => setScriptOpen((v) => !v)}
                          className="flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:underline"
                        >
                          스크립트 보기
                          {scriptOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>
                        {scriptOpen && (
                          <p className="mt-2 max-h-32 overflow-y-auto text-[11px] leading-relaxed text-muted-foreground">
                            {briefing.script}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">스크립트가 없습니다</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* 푸터 — 지난 브리핑 링크 */}
          <div className="border-t border-border px-4 py-2.5">
            <Link
              href="/dashboard/briefings"
              className="text-[11px] text-brand-600 hover:underline"
            >
              지난 브리핑 보기 →
            </Link>
          </div>
        </div>
      )}

      {/* ── 플로팅 버튼 ─────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-white shadow-lg transition-all',
          open
            ? 'bg-brand-700 shadow-brand-600/20'
            : 'bg-brand-600 hover:bg-brand-700',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2'
        )}
        aria-label="오늘의 브리핑 열기"
        aria-expanded={open}
      >
        <Radio className="h-4 w-4" />
        <span>오늘의 브리핑</span>
      </button>
    </div>
  )
}
