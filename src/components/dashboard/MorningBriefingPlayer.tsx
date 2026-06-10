'use client'

import { useState, useRef, useEffect } from 'react'

interface MorningBriefingPlayerProps {
  audioUrl?: string
}

export default function MorningBriefingPlayer({ audioUrl }: MorningBriefingPlayerProps) {
  const [open, setOpen] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [btnVisible, setBtnVisible] = useState(true)
  const audioRef     = useRef<HTMLAudioElement | null>(null)
  const lastScrollY  = useRef(0)
  const showTimeout  = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isAvailable = !!audioUrl
  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  })

  useEffect(() => {
    if (!audioUrl) return
    audioRef.current = new Audio(audioUrl)
    audioRef.current.onended = () => setPlaying(false)
    return () => {
      audioRef.current?.pause()
      audioRef.current = null
    }
  }, [audioUrl])

  // 아래 스크롤 시 버튼 숨김, 위 스크롤·정지 시 표시
  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY
      const delta = currentY - lastScrollY.current

      if (delta > 5) {
        setBtnVisible(false)
      } else if (delta < -5) {
        setBtnVisible(true)
      }
      lastScrollY.current = currentY

      if (showTimeout.current) clearTimeout(showTimeout.current)
      showTimeout.current = setTimeout(() => setBtnVisible(true), 1500)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (showTimeout.current) clearTimeout(showTimeout.current)
    }
  }, [])

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

  function handleClose() {
    audioRef.current?.pause()
    setPlaying(false)
    setOpen(false)
  }

  return (
    <>
      {/* Floating trigger button — 아래 스크롤 시 숨김 */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="모닝 브리핑 열기"
        className={`fixed bottom-6 right-6 z-50 flex flex-col items-center justify-center gap-1 rounded-2xl px-4 py-3 shadow-xl transition-all duration-300 hover:scale-105 hover:shadow-2xl active:scale-95 ${
          btnVisible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-20 opacity-0'
        }`}
        style={{
          background: '#1A1A4E',
          minWidth: '72px',
        }}
      >
        {/* Microphone SVG icon */}
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="2" width="6" height="11" rx="3" />
          <path d="M5 10a7 7 0 0 0 14 0" />
          <line x1="12" y1="19" x2="12" y2="22" />
          <line x1="9" y1="22" x2="15" y2="22" />
        </svg>
        <span className="text-white font-semibold leading-none" style={{ fontSize: '9px', letterSpacing: '0.05em' }}>
          모닝브리핑
        </span>
      </button>

      {/* Mini player popup */}
      {open && (
        <div
          className={`fixed bottom-24 right-6 z-50 w-72 overflow-hidden rounded-2xl shadow-2xl transition-all duration-300 ${
            btnVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          style={{ backgroundColor: '#2D2D6E' }}
        >
          {/* Header stripe */}
          <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: '#1A1A4E' }}>
            <span className="text-sm font-semibold text-white">오늘의 모닝 브리핑</span>
            <button
              onClick={handleClose}
              aria-label="닫기"
              className="text-white/60 hover:text-white text-lg leading-none"
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="flex flex-col items-center gap-4 px-5 py-5">
            {/* Date */}
            <p className="text-xs text-white/60">{today}</p>

            {/* Play / Coming soon */}
            {isAvailable ? (
              <button
                onClick={togglePlay}
                aria-label={playing ? '일시정지' : '재생'}
                className="flex h-14 w-14 items-center justify-center rounded-full text-white shadow-md transition-transform hover:scale-110 active:scale-95"
                style={{ backgroundColor: '#E6007E' }}
              >
                {playing ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="5" y="4" width="4" height="16" rx="1" />
                    <rect x="15" y="4" width="4" height="16" rx="1" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-full opacity-40"
                  style={{ backgroundColor: '#E6007E' }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
                <span
                  className="rounded-full px-3 py-0.5 text-xs font-semibold text-white"
                  style={{ backgroundColor: '#E6007E' }}
                >
                  Coming Soon
                </span>
              </div>
            )}

            <p className="text-center text-xs text-white/60">
              {isAvailable
                ? '재생 버튼을 눌러 오늘의 브리핑을 들어보세요.'
                : '곧 모닝 브리핑 서비스가 시작됩니다.'}
            </p>
          </div>
        </div>
      )}
    </>
  )
}
