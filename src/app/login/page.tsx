import type { Metadata } from 'next'
import { Suspense } from 'react'
import { BulbScene } from '@/components/login/BulbScene'
import { LoginCard } from '@/components/login/LoginCard'

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
    <main className="io-login relative flex min-h-screen w-full flex-col overflow-hidden px-4 sm:px-8 lg:px-12 xl:px-16">
      {/* ── 헤드라인 — 화면 상단 고정 ── */}
      <header className="hero-copy relative z-10 mx-auto w-full max-w-[1500px] pt-8 text-center lg:pt-2 lg:text-left">
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
      </header>

      {/* ── 전구 + 로그인 카드 — 남은 공간에서 세로 중앙 ── */}
      <div className="flex flex-1 items-center pb-6 lg:pb-2">
        <div className="grid w-full max-w-[1500px] items-center gap-10 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,460px)] lg:gap-16 mx-auto">
          {/* 전구 히어로 — 크게, 중심적으로. 데스크톱에선 컬럼보다 넓게 펼쳐
              보라색 광류 밴드가 히어로 영역을 가득 채우게 한다. 256: 헤드라인이 그리드
              밖 상단으로 분리되며 세로 공간을 더 쓰게 되어, 250의 122%보다 축소.
              씬 폭(=높이, aspect 고정)은 1280~1535 구간 107%, 2xl(1536~) 88% — 폭이
              커질수록 씬이 커지는데 세로 여유는 비례해 늘지 않아 2xl 에서 별도로 더
              축소해야 1280×800·1440×900·1536×864 세로 스크롤 0 유지(세로 위치는
              flex-1 items-center 가 결정, 카드 높이 560 은 250 기준 유지). */}
          <section className="relative min-w-0">
            <div className="mx-auto w-full max-w-[840px] lg:-ml-[6%] lg:w-[107%] lg:max-w-none 2xl:-ml-[5%] 2xl:w-[88%]">
              <BulbScene />
            </div>
          </section>

          {/* ── 로그인 카드 ── */}
          <section className="w-full max-w-[460px] justify-self-center lg:justify-self-end">
            <Suspense
              fallback={
                <div className="h-[560px] w-full rounded-[30px] border border-slate-200/70 bg-white shadow-[0_40px_90px_-30px_rgba(24,39,75,0.30)]" />
              }
            >
              <LoginCard />
            </Suspense>
          </section>
        </div>
      </div>
    </main>
  )
}
