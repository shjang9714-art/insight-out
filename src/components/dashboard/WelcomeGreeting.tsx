import { Nanum_Myeongjo } from 'next/font/google'
import { createClient } from '@/lib/supabase/server'
import { getKstHour } from '@/lib/date'
import { cn } from '@/lib/utils'

/** 메인 인사말 문구 전용 세리프 폰트. 레이아웃 전체 폰트(Pretendard)는 그대로 두고
 *  이 컴포넌트의 메인 라인에만 국한해서 적용. */
const nanumMyeongjo = Nanum_Myeongjo({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
})

type GreetingPeriod = 'morning' | 'afternoon' | 'evening' | 'night'

interface GreetingPhrase {
  main: (name: string) => string
  sub: string
}

/** 시간대별 문구 후보. 서브 문구에는 실시간 집계 숫자("N건" 등)를 절대 넣지 않는다
 *  — DB 쿼리 실패·값 불일치 시 오류·이상값 노출 위험 때문에 전부 고정 정성적 표현만 사용. */
const GREETING_PHRASES: Record<GreetingPeriod, GreetingPhrase[]> = {
  morning: [
    { main: (n) => `좋은 아침이에요, ${n}님`, sub: '오늘의 인사이트를 확인해보세요' },
    { main: (n) => `상쾌한 아침이에요, ${n}님`, sub: '새로운 소식이 도착했어요' },
    { main: (n) => `${n}님, 오늘 하루도 인사이트와 함께`, sub: '모닝브리핑이 준비됐어요' },
    { main: (n) => `좋은 아침입니다, ${n}님`, sub: '밤사이 쌓인 이슈부터 볼까요?' },
  ],
  afternoon: [
    { main: (n) => `좋은 오후예요, ${n}님`, sub: '오늘의 인사이트를 살펴보세요' },
    { main: (n) => `${n}님, 오후에도 힘내세요`, sub: '새로운 이슈가 쌓였어요' },
    { main: (n) => `${n}님, 오늘의 소식을 확인해보세요`, sub: '관심기업 소식이 갱신됐어요' },
    { main: (n) => `${n}님, 오늘의 핵심 이슈를 정리해뒀어요`, sub: '지금 확인해보세요' },
  ],
  evening: [
    { main: (n) => `오늘 하루도 고생 많으셨어요, ${n}님`, sub: '놓친 인사이트가 있는지 볼까요?' },
    { main: (n) => `${n}님, 하루를 마무리하며`, sub: '오늘의 이슈를 정리해보세요' },
    { main: (n) => `저녁이네요, ${n}님`, sub: '오늘 있었던 주요 소식이에요' },
    { main: (n) => `${n}님, 오늘 하루 요약이 준비됐어요`, sub: '지금 확인해보세요' },
  ],
  night: [
    { main: (n) => `늦은 시간까지 수고 많으세요, ${n}님`, sub: '오늘의 핵심만 빠르게 훑어보세요' },
    { main: (n) => `${n}님, 자기 전에 잠깐`, sub: '오늘의 인사이트를 살펴보세요' },
    { main: (n) => `${n}님, 오늘 하루도 수고하셨어요`, sub: '내일 아침 브리핑이 준비되고 있어요' },
    { main: (n) => `밤이 깊었네요, ${n}님`, sub: '내일을 위한 인사이트가 준비됐어요' },
  ],
}

/** KST 기준 시(0~23) → 4구간(아침 05~11 / 오후 11~17 / 저녁 17~21 / 밤 21~05). */
function getGreetingPeriod(hour: number): GreetingPeriod {
  if (hour >= 5 && hour < 11) return 'morning'
  if (hour >= 11 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 21) return 'evening'
  return 'night'
}

/** 온보딩 미완료 등으로 이름이 비어 있을 때의 표시용 대체값. */
const FALLBACK_NAME = '회원'

/** 접속마다 랜덤 문구 하나 선택. Math.random 호출을 컴포넌트 본문 밖으로 분리해
 *  react-compiler 의 impure-call-in-render 규칙을 피한다(서버 컴포넌트는 요청마다
 *  새로 실행되므로 렌더 순수성 문제는 실질적으로 없음). */
function pickRandomPhrase(period: GreetingPeriod): GreetingPhrase {
  const phrases = GREETING_PHRASES[period]
  return phrases[Math.floor(Math.random() * phrases.length)]
}

export default async function WelcomeGreeting() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('users')
    .select('name')
    .eq('id', user.id)
    .single()

  const name = profile?.name || FALLBACK_NAME
  const period = getGreetingPeriod(getKstHour())
  const phrase = pickRandomPhrase(period)

  return (
    <div className="pt-10 pb-16">
      <p className={cn(nanumMyeongjo.className, 'text-[26px] font-normal text-[#3A3733] dark:text-foreground')}>
        {phrase.main(name)}
      </p>
      <p className="text-[15px] text-muted-foreground">{phrase.sub}</p>
    </div>
  )
}
