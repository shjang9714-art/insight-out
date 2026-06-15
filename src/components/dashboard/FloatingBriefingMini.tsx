'use client'

import { useState, useEffect, useRef, startTransition } from 'react'
import Link from 'next/link'
import { Radio, X, Play, Pause, ChevronDown, ChevronUp, SkipBack } from 'lucide-react'
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

// ─── 비주얼라이저 (재생 중 파형 애니메이션) ─────────────────────────────────

function AudioWaveform({ playing }: { playing: boolean }) {
  return (
    <div className="flex items-end gap-[2px] h-4">
      {[3, 5, 7, 4, 6, 8, 3, 5, 7, 4].map((h, i) => (
        <div
          key={i}
          className={cn(
            'w-[2px] rounded-full bg-brand-600 transition-all',
            playing ? 'animate-pulse' : ''
          )}
          style={{
            height: playing ? `${h * 2}px` : '3px',
            animationDelay: `${i * 60}ms`,
            animationDuration: `${400 + i * 80}ms`,
          }}
        />
      ))}
    </div>
  )
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function FloatingBriefingMini() {
  const [open, setOpen]               = useState(false)
  const [briefing, setBriefing]       = useState<Briefing | null | undefined>(undefined)
  const [playing, setPlaying]         = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration]       = useState(0)
  const [scriptOpen, setScriptOpen]   = useState(false)
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

  function handleRestart() {
    if (!audioRef.current) return
    audioRef.current.currentTime = 0
    setCurrentTime(0)
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

      {/* ── iPod nano 스타일 미니 플레이어 ────────────────────────────────── */}
      {open && (
        <div className="relative mb-3 w-52 overflow-hidden rounded-[28px] bg-zinc-900 shadow-2xl ring-1 ring-white/10">

          {/* 닫기 버튼 (우상단) */}
          <button
            onClick={() => setOpen(false)}
            className="absolute right-3 top-3 z-10 rounded-full bg-zinc-700/80 p-1 text-zinc-300 transition-colors hover:bg-zinc-600"
            aria-label="닫기"
          >
            <X className="h-3 w-3" />
          </button>

          {/* ── LCD 스크린 영역 ─────────────────────────────────────────── */}
          <div className="relative bg-zinc-800 px-4 pt-5 pb-4">
            {/* 스크린 상단 표시줄 */}
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Radio className="h-3 w-3 text-brand-600" />
                <span className="text-[10px] font-semibold tracking-wide text-zinc-400 uppercase">Briefing</span>
              </div>
              <AudioWaveform playing={playing} />
            </div>

            {/* 콘텐츠 */}
            {isLoading ? (
              <div className="space-y-2 py-3">
                <div className="h-2 w-2/3 animate-pulse rounded bg-zinc-700" />
                <div className="h-3 w-full animate-pulse rounded bg-zinc-700" />
              </div>
            ) : !briefing ? (
              <p className="py-4 text-center text-[11px] text-zinc-500">
                오늘 브리핑이 없습니다
              </p>
            ) : (
              <>
                <p className="text-[10px] text-zinc-500">{dateLabel(briefing.briefing_date)}</p>
                <p className="mt-1 line-clamp-2 text-xs font-medium leading-snug text-zinc-100">
                  {briefing.title ?? '모닝브리핑'}
                </p>

                {/* 진행 바 */}
                <div className="mt-3 space-y-1">
                  <div
                    role="slider"
                    aria-label="재생 위치"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(progress * 100)}
                    tabIndex={0}
                    className="relative h-1 cursor-pointer rounded-full bg-zinc-700"
                    onClick={hasAudio ? handleSeek : undefined}
                  >
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-brand-600 transition-all"
                      style={{ width: `${progress * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] tabular-nums text-zinc-500">
                    <span>{formatTime(currentTime)}</span>
                    <span>{duration > 0 ? formatTime(duration) : '--:--'}</span>
                  </div>
                </div>

                {/* 스크립트 폴백 (오디오 없을 때) */}
                {!hasAudio && briefing.script && (
                  <div className="mt-2">
                    <p className="mb-1 text-[10px] text-zinc-500">오디오 준비 전 · 스크립트 제공</p>
                    <button
                      onClick={() => setScriptOpen((v) => !v)}
                      className="flex items-center gap-0.5 text-[10px] font-medium text-brand-600 hover:underline"
                    >
                      스크립트 보기
                      {scriptOpen ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
                    </button>
                    {scriptOpen && (
                      <p className="mt-1.5 max-h-24 overflow-y-auto text-[10px] leading-relaxed text-zinc-400">
                        {briefing.script}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── 클릭 휠 영역 ────────────────────────────────────────────── */}
          <div className="flex flex-col items-center gap-3 px-4 py-5">
            {/* 원형 휠 */}
            <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-zinc-700 shadow-inner ring-1 ring-white/5">
              {/* 재생/일시정지 중앙 버튼 */}
              <button
                onClick={hasAudio ? togglePlay : undefined}
                disabled={!hasAudio || isLoading || !briefing}
                className={cn(
                  'flex h-12 w-12 items-center justify-center rounded-full transition-all',
                  hasAudio && briefing
                    ? 'bg-zinc-900 text-white shadow-md hover:bg-zinc-800 active:scale-95'
                    : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                )}
                aria-label={playing ? '일시정지' : '재생'}
              >
                {playing
                  ? <Pause className="h-5 w-5" />
                  : <Play className="h-5 w-5 pl-0.5" />
                }
              </button>

              {/* 휠 상단 — 처음으로 */}
              <button
                onClick={hasAudio ? handleRestart : undefined}
                disabled={!hasAudio}
                className="absolute top-1 left-1/2 -translate-x-1/2 rounded-full p-1 text-zinc-400 hover:text-zinc-200 disabled:text-zinc-700"
                aria-label="처음으로"
              >
                <SkipBack className="h-3 w-3" />
              </button>
            </div>

            {/* 지난 브리핑 링크 */}
            <Link
              href="/dashboard/briefings"
              className="text-[10px] text-zinc-500 transition-colors hover:text-brand-600"
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
