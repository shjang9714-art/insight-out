'use client'

import { useState, useRef, useEffect, startTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'
import {
  getLatestPublishedBriefing,
  type BriefingPlayerRow,
} from '@/lib/briefing/audio-url'

interface MorningBriefingPlayerProps {
  /** 아카이브 등 외부에서 briefing 주입 가능. 미전달 시 최신 공개분 자체 조회. */
  briefing?: BriefingPlayerRow | null
}

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const WHEEL_R  = 36
const WHEEL_CIRC = 2 * Math.PI * WHEEL_R  // ≈ 226.2

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function MorningBriefingPlayer({ briefing: briefingProp }: MorningBriefingPlayerProps) {
  const [briefing, setBriefing]     = useState<BriefingPlayerRow | null>(briefingProp ?? null)
  const [loading, setLoading]       = useState(briefingProp === undefined)
  const [playing, setPlaying]       = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration]     = useState(0)
  const [scriptOpen, setScriptOpen] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // briefingProp 주입 또는 DB 최신 공개분 조회
  useEffect(() => {
    if (briefingProp !== undefined) {
      startTransition(() => {
        setBriefing(briefingProp ?? null)
        setLoading(false)
      })
      return
    }
    startTransition(() => setLoading(true))
    getLatestPublishedBriefing(createClient())
      .then((data) => {
        setBriefing(data)
        setLoading(false)
      })
  }, [briefingProp])

  // 오디오 인스턴스 관리
  useEffect(() => {
    if (!briefing?.audio_url) {
      startTransition(() => {
        setCurrentTime(0)
        setDuration(briefing?.audio_duration_seconds ?? 0)
      })
      return
    }
    const audio = new Audio()
    audio.preload = 'none' // ← src 보다 먼저 — 재생 전 자동 다운로드 차단(391)
    audio.src = briefing.audio_url
    audioRef.current = audio

    if (briefing.audio_duration_seconds) startTransition(() => setDuration(briefing.audio_duration_seconds!))

    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration || briefing.audio_duration_seconds || 0)
    })
    audio.addEventListener('timeupdate', () => setCurrentTime(audio.currentTime))
    audio.addEventListener('ended', () => {
      setPlaying(false)
      setCurrentTime(0)
    })

    return () => {
      audio.pause()
      audioRef.current = null
      setPlaying(false)
      setCurrentTime(0)
    }
  }, [briefing?.audio_url, briefing?.audio_duration_seconds])

  function togglePlay() {
    if (!audioRef.current) return
    if (playing) {
      audioRef.current.pause()
      setPlaying(false)
    } else {
      audioRef.current.play()
      setPlaying(true)
    }
  }

  function seek(delta: number) {
    if (!audioRef.current) return
    audioRef.current.currentTime = Math.max(0, Math.min(duration, audioRef.current.currentTime + delta))
  }

  const progress   = duration > 0 ? currentTime / duration : 0
  const dashOffset = WHEEL_CIRC * (1 - progress)
  const hasAudio   = !!briefing?.audio_url
  const briefingTitle = briefing?.title ? stripLlmArtifacts(briefing.title) : null
  const briefingScript = briefing?.script ? stripLlmArtifacts(briefing.script) : null

  const dateLabel = briefing
    ? new Date(briefing.briefing_date + 'T00:00:00').toLocaleDateString('ko-KR', {
        year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
      })
    : ''

  // ─── 실버 바디 래퍼 공통 클래스 ──────────────────────────────────────────
  const silverCard = 'rounded-2xl border border-gray-300 bg-gradient-to-b from-gray-100 to-gray-200 p-4 shadow-md dark:border-gray-600 dark:from-gray-700 dark:to-gray-800'

  // ─── 로딩 ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={silverCard}>
        <div className="mb-3 flex items-center gap-2">
          <span className="text-base">🎙</span>
          <h3 className="text-sm font-semibold text-foreground">오늘의 브리핑</h3>
        </div>
        <div className="flex animate-pulse flex-col items-center gap-3 py-4">
          <div className="h-20 w-20 rounded-full bg-gray-300 dark:bg-gray-600" />
          <div className="h-3 w-2/3 rounded bg-gray-300 dark:bg-gray-600" />
        </div>
      </div>
    )
  }

  // ─── 빈 상태 ──────────────────────────────────────────────────────────────
  if (!briefing) {
    return (
      <div className={silverCard}>
        <div className="mb-3 flex items-center gap-2">
          <span className="text-base">🎙</span>
          <h3 className="text-sm font-semibold text-foreground">오늘의 브리핑</h3>
        </div>
        <p className="py-6 text-center text-xs text-muted-foreground">오늘 브리핑이 아직 없습니다</p>
      </div>
    )
  }

  // ─── 플레이어 ─────────────────────────────────────────────────────────────
  return (
    <div className={silverCard}>
      {/* 헤더 */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-base">🎙</span>
        <h3 className="text-sm font-semibold text-foreground">오늘의 브리핑</h3>
      </div>

      {/* 디스플레이 영역 */}
      <div className="mb-4 rounded-xl bg-gray-900/90 px-3 py-3 dark:bg-gray-950/90">
        <p className="text-[10px] text-gray-400">{dateLabel}</p>
        <p className="mt-0.5 truncate text-xs font-semibold leading-snug text-white">
          {briefingTitle ?? '모닝브리핑'}
        </p>
        <p className="mt-1 text-[10px] tabular-nums text-gray-400">
          {hasAudio
            ? duration > 0 ? `${formatTime(currentTime)} / ${formatTime(duration)}` : '로딩 중...'
            : '오디오 없음'}
        </p>
      </div>

      {/* 클릭휠 */}
      <div className="flex justify-center">
        <div className="relative" style={{ width: 120, height: 120 }}>
          {/* 휠 바디 (실버 원) */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 shadow-inner dark:from-gray-600 dark:to-gray-700" />

          {/* 원형 진행 링 */}
          <svg
            width="120"
            height="120"
            viewBox="0 0 100 100"
            className="absolute inset-0 -rotate-90"
            aria-hidden="true"
          >
            {/* 배경 링 */}
            <circle
              cx="50" cy="50" r={WHEEL_R}
              fill="none"
              stroke="currentColor"
              strokeWidth="5"
              className="text-gray-300 dark:text-gray-500"
            />
            {/* 진행 링 */}
            <circle
              cx="50" cy="50" r={WHEEL_R}
              fill="none"
              stroke="currentColor"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={WHEEL_CIRC}
              strokeDashoffset={dashOffset}
              className="text-brand-600 dark:text-brand-400"
              style={{ transition: 'stroke-dashoffset 0.2s ease' }}
            />
          </svg>

          {/* seek 투명 버튼 (좌 -10s / 우 +10s) */}
          {hasAudio && (
            <>
              <button
                type="button"
                onClick={() => seek(-10)}
                aria-label="-10초"
                className="absolute inset-y-0 left-0 w-1/2 rounded-l-full"
              />
              <button
                type="button"
                onClick={() => seek(10)}
                aria-label="+10초"
                className="absolute inset-y-0 right-0 w-1/2 rounded-r-full"
              />
            </>
          )}

          {/* 중앙 재생/일시정지 버튼 */}
          <button
            type="button"
            onClick={hasAudio ? togglePlay : undefined}
            aria-label={playing ? '일시정지' : '재생'}
            disabled={!hasAudio}
            className={cn(
              'absolute left-1/2 top-1/2 z-10 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full transition-transform',
              hasAudio
                ? 'bg-brand-solid text-white shadow-lg hover:bg-brand-solid-hover active:scale-95'
                : 'cursor-not-allowed bg-gray-300 text-gray-400 dark:bg-gray-600 dark:text-gray-500'
            )}
          >
            {playing ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <rect x="5" y="4" width="4" height="16" rx="1" />
                <rect x="15" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* seek 힌트 레이블 */}
          {hasAudio && (
            <>
              <span className="pointer-events-none absolute left-0.5 top-1/2 -translate-y-1/2 text-[9px] font-medium text-gray-400 dark:text-gray-500">
                ◂10
              </span>
              <span className="pointer-events-none absolute right-0.5 top-1/2 -translate-y-1/2 text-[9px] font-medium text-gray-400 dark:text-gray-500">
                10▸
              </span>
            </>
          )}
        </div>
      </div>

      {/* 오디오 없음 안내 */}
      {!hasAudio && (
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          오디오 생성 전 · 스크립트만 제공
        </p>
      )}

      {/* 스크립트 접힘/펼침 */}
      {briefingScript && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setScriptOpen((v) => !v)}
            className="w-full text-center text-[11px] font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
          >
            {scriptOpen ? '스크립트 접기 ▲' : '스크립트 보기 ▼'}
          </button>
          {scriptOpen && (
            <div className="mt-2 max-h-40 overflow-y-auto rounded-lg bg-gray-900/80 px-3 py-2.5 dark:bg-gray-950/80">
              <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-gray-200">
                {briefingScript}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
