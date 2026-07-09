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
          {/* 전구 히어로 — 크게, 중심적으로. 262: 256의 폭 퍼센트(2xl 88%)만으로는
              화면이 더 넓어질수록(1920·2560 등) 씬 폭이 절대값으로 커져 aspect 고정 탓에
              높이도 같이 커져 세로로 다시 넘친다. → 폭을 "컬럼 대비 %"와 "세로 높이 기준
              환산값(87vh ≈ 65vh 높이를 aspect[1456/1087]로 폭 환산)" 중 작은 쪽으로 제한해
              화면 폭이 아무리 넓어져도 씬 높이가 절대 65vh 를 넘지 않게 한다(aspect 고정이라
              폭도 함께 축소). 좁은 뷰포트(1280~1536)에서는 %가, 넓은 뷰포트(1920·2560)에서는
              vh 환산값이 상한으로 작동 — 5개 뷰포트(1280×800·1440×900·1536×864·1920×1080·
              2560×1440) 세로 스크롤 0 실측 튜닝(카드 높이 560 은 250 기준 유지). */}
          <section className="relative min-w-0">
            <div className="mx-auto w-full max-w-[840px] lg:-ml-[6%] lg:w-[min(107%,87vh)] lg:max-w-none">
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
