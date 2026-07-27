import type { Metadata } from 'next'
import { Suspense } from 'react'
import { BulbScene } from '@/components/login/BulbScene'
import { LoginCard } from '@/components/login/LoginCard'
import { LoginScreen } from '@/components/login/LoginScreen'

export const metadata: Metadata = {
  title: '로그인 · Insight Out',
  description: '흩어진 인텔리전스를 하나의 흐름으로. 계정에 로그인하세요.',
}

/**
 * 로그인 페이지 — 마지막 확정 목업(v3)의 넓은 프리미엄 landing 비율을 재현한다.
 * 좌측: 브랜드 카피 + 크고 중심적인 전구 히어로(빛의 흐름). 우측: 밝은 glass 로그인 카드.
 * 인증 전 독립 화면이므로 전역 다크 테마와 무관하게 항상 라이트 컴포지션(.io-login).
 */
export default function LoginPage() {
  return (
    <LoginScreen>
      <main className="io-login relative flex min-h-screen w-full items-center justify-center overflow-hidden px-4 py-8 sm:px-8 lg:h-screen lg:px-16 lg:py-10">
        <div className="grid w-full max-w-[1500px] items-center gap-10 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,460px)] lg:gap-16">
          {/* ── 좌측 히어로: 카피(좌상단) + 전구 씬 ── */}
          <section className="relative hidden lg:flex min-w-0 flex-col items-center text-center lg:h-[calc(100vh-5rem)] lg:items-start lg:text-left">
            <div className="hero-copy relative z-10 max-w-2xl px-1">
              <h1
                className="font-extrabold tracking-[-0.045em] text-[#0f244d]"
                style={{ fontSize: 'clamp(34px, 3.6vw, 52px)', lineHeight: 1.08 }}
              >
                흩어진 인텔리전스를
                <br /> 하나의 흐름으로,
              </h1>
              <p className="mt-3 text-lg font-medium italic tracking-wide text-slate-400 sm:text-xl">
                Intelligence in. Insight out.
              </p>
              <p className="mt-5 leading-relaxed text-slate-500 sm:text-[17px]">
                뉴스, 리포트, 영상, 데이터를 모아
                <br className="hidden sm:block" /> 실행 가능한 인사이트로 전환합니다.
              </p>
            </div>

            {/* 전구 씬 — absolute 오버플로 레이어(레이아웃 높이 미기여 → 세로 스크롤 0).
                main lg:h-screen + overflow-hidden 이 화면 밖을 클립하고 asset feather 가
                가장자리를 자연 소멸시킨다. 폭 113vw 는 asset 1820 기준 — 전구 렌더 크기가
                이전 확정 컴포지션(153% × 컬럼, asset 1456)과 동일해지는 값. 카피(z-10)가
                위 레이어라 desc 텍스트와 살짝 겹쳐도 가독성 유지(David 확정). */}
            <div className="mx-auto mt-4 w-full max-w-[840px] lg:absolute lg:top-[54%] lg:left-[49%] lg:mt-0 lg:w-[113vw] lg:max-w-none lg:-translate-x-1/2 lg:-translate-y-1/2">
              <BulbScene />
            </div>
          </section>

          {/* ── 로그인 카드 ── */}
          <section className="w-full max-w-[420px] justify-self-center lg:max-w-[460px] lg:justify-self-end">
            <Suspense
              fallback={
                <div className="h-[560px] w-full rounded-[30px] border border-slate-200/70 bg-white shadow-[0_40px_90px_-30px_rgba(24,39,75,0.30)]" />
              }
            >
              <LoginCard />
            </Suspense>
          </section>
        </div>
      </main>
    </LoginScreen>
  )
}
