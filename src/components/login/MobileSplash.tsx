'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import styles from './MobileSplash.module.css'

type MobileSplashProps = {
  onDone: () => void
}

// 프로토타입 키프레임 bulbAppear·bulbIgnite·bulbBreath·flashPop·riseIn·load는 CSS 모듈에 같은 수치로 둔다.
// 세션 1회 노출(io_splash_seen·sessionStorage)은 얇은 LoginScreen 래퍼가 담당한다.
export function MobileSplash({ onDone }: MobileSplashProps) {
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(() => setIsExiting(true), reducedMotion ? 600 : 3400)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!isExiting) return
    const timer = window.setTimeout(onDone, 480)
    return () => window.clearTimeout(timer)
  }, [isExiting, onDone])

  return (
    <button
      type="button"
      className={cn(styles.splash, isExiting && styles.exiting)}
      onClick={() => setIsExiting(true)}
      aria-label="스플래시를 건너뛰고 로그인 시작"
    >
      <span className={styles.stage} aria-hidden="true">
        <span className={styles.glow} />
        <span className={styles.flash} />
        <span className={styles.bulbWrap}>
          <Image
            src="/brand/login-bulb-scene.png"
            alt=""
            fill
            priority
            sizes="128vw"
            className={styles.bulbImage}
          />
          <svg className={styles.effects} viewBox="0 0 460 600" preserveAspectRatio="xMidYMid slice">
            <defs>
              <radialGradient id="orbG">
                <stop offset="0%" stopColor="#fff8dd" />
                <stop offset="55%" stopColor="#ffd98a" />
                <stop offset="100%" stopColor="#ffd98a" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="orbP">
                <stop offset="0%" stopColor="#ffe3f2" />
                <stop offset="55%" stopColor="#ff9ed4" />
                <stop offset="100%" stopColor="#ff9ed4" stopOpacity="0" />
              </radialGradient>
            </defs>
            <g strokeWidth="1.1" fill="none" opacity=".38">
              <path d="M-20,150 C90,170 150,230 218,268" stroke="#ffe6b3" />
              <path d="M-30,320 C80,310 160,290 216,276" stroke="#ffd6ec" />
              <path d="M480,140 C370,170 300,230 244,266" stroke="#ffe6b3" />
              <path d="M490,330 C380,320 300,292 246,276" stroke="#ffd6ec" />
              <path d="M-10,430 C110,410 180,330 214,284" stroke="#ffe6b3" />
              <path d="M470,440 C350,420 280,335 248,284" stroke="#ffd6ec" />
            </g>
            <g>
              <circle r="7" fill="url(#orbG)"><animateMotion dur="2.6s" repeatCount="indefinite" path="M-20,150 C90,170 150,230 218,268" /><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.15;.8;1" dur="2.6s" repeatCount="indefinite" /></circle>
              <circle r="5" fill="url(#orbP)"><animateMotion dur="3.4s" begin=".5s" repeatCount="indefinite" path="M-30,320 C80,310 160,290 216,276" /><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.15;.8;1" dur="3.4s" begin=".5s" repeatCount="indefinite" /></circle>
              <circle r="6.5" fill="url(#orbG)"><animateMotion dur="2.9s" begin=".9s" repeatCount="indefinite" path="M480,140 C370,170 300,230 244,266" /><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.15;.8;1" dur="2.9s" begin=".9s" repeatCount="indefinite" /></circle>
              <circle r="4.5" fill="url(#orbP)"><animateMotion dur="3.8s" begin=".2s" repeatCount="indefinite" path="M490,330 C380,320 300,292 246,276" /><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.15;.8;1" dur="3.8s" begin=".2s" repeatCount="indefinite" /></circle>
              <circle r="5.5" fill="url(#orbG)"><animateMotion dur="3.1s" begin="1.3s" repeatCount="indefinite" path="M-10,430 C110,410 180,330 214,284" /><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.15;.8;1" dur="3.1s" begin="1.3s" repeatCount="indefinite" /></circle>
              <circle r="4" fill="url(#orbP)"><animateMotion dur="3.6s" begin="1.7s" repeatCount="indefinite" path="M470,440 C350,420 280,335 248,284" /><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.15;.8;1" dur="3.6s" begin="1.7s" repeatCount="indefinite" /></circle>
            </g>
            <circle className={styles.twinkle} cx="120" cy="180" r="4" fill="#fff2c8" />
            <circle className={cn(styles.twinkle, styles.twinkleTwo)} cx="340" cy="160" r="3.4" fill="#ffd9ee" />
            <circle className={cn(styles.twinkle, styles.twinkleThree)} cx="88" cy="360" r="3" fill="#fff2c8" />
            <circle className={cn(styles.twinkle, styles.twinkleFour)} cx="368" cy="352" r="4.2" fill="#ffd9ee" />
          </svg>
        </span>
      </span>

      <span className={styles.copy}>
        <span className={cn(styles.copyTitle, 'block')}>
          흩어진 인텔리전스를<br />하나의 흐름으로,
        </span>
        <span className={cn(styles.englishCopy, 'block')}>Intelligence in. Insight out.</span>
      </span>
      <span className={styles.loader}><span className={styles.loaderBar} /></span>
      <span className={styles.skip}>화면을 탭하면 바로 시작합니다</span>
    </button>
  )
}
