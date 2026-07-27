'use client'

import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { MobileSplash } from '@/components/login/MobileSplash'

const SPLASH_SESSION_KEY = 'io_splash_seen'

type SplashState = 'checking' | 'visible' | 'hidden'

export function LoginScreen({ children }: { children: ReactNode }) {
  const [splashState, setSplashState] = useState<SplashState>('checking')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (window.matchMedia('(min-width: 1024px)').matches) {
        setSplashState('hidden')
        return
      }

      try {
        setSplashState(sessionStorage.getItem(SPLASH_SESSION_KEY) === '1' ? 'hidden' : 'visible')
      } catch {
        setSplashState('visible')
      }
    }, 0)

    return () => window.clearTimeout(timer)
  }, [])

  const finishSplash = () => {
    try {
      sessionStorage.setItem(SPLASH_SESSION_KEY, '1')
    } catch {
      // 저장소 접근이 막혀도 로그인 화면 전환은 계속한다.
    }
    setSplashState('hidden')
  }

  return (
    <>
      {splashState === 'checking' && (
        <div className="fixed inset-0 z-[100] bg-[#f4f1fb] lg:hidden" aria-hidden="true" />
      )}
      {splashState === 'visible' && <MobileSplash onDone={finishSplash} />}
      {children}
    </>
  )
}
