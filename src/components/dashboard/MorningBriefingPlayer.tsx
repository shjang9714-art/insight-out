'use client'

import { useState, useRef, useEffect } from 'react'

interface MorningBriefingPlayerProps {
  audioUrl?: string
}

export default function MorningBriefingPlayer({ audioUrl }: MorningBriefingPlayerProps) {
  const [open, setOpen] = useState(false)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

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
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="모닝 브리핑 열기"
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-110 active:scale-95"
        style={{ backgroundColor: '#E6007E' }}
      >
        <span className="text-2xl">🎙️</span>
      </button>

      {/* Mini player popup */}
      {open && (
        <div
          className="fixed bottom-24 right-6 z-50 w-72 overflow-hidden rounded-2xl bg-white shadow-2xl"
          style={{ border: '1.5px solid #f0f0f0' }}
        >
          {/* Header stripe */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ backgroundColor: '#E6007E' }}
          >
            <span className="text-sm font-semibold text-white">오늘의 모닝 브리핑</span>
            <button
              onClick={handleClose}
              aria-label="닫기"
              className="text-white/80 hover:text-white text-lg leading-none"
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="flex flex-col items-center gap-4 px-5 py-5">
            {/* Date */}
            <p className="text-xs text-gray-400">{today}</p>

            {/* Play / Coming soon */}
            {isAvailable ? (
              <button
                onClick={togglePlay}
                aria-label={playing ? '일시정지' : '재생'}
                className="flex h-14 w-14 items-center justify-center rounded-full text-white shadow-md transition-transform hover:scale-110 active:scale-95"
                style={{ backgroundColor: '#E6007E' }}
              >
                {playing ? (
                  /* Pause icon */
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="5" y="4" width="4" height="16" rx="1" />
                    <rect x="15" y="4" width="4" height="16" rx="1" />
                  </svg>
                ) : (
                  /* Play icon */
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

            <p className="text-center text-xs text-gray-400">
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
