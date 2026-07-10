import PreparingBackButton from '@/components/PreparingBackButton'

interface Props {
  /** not-found: 요청한 콘텐츠가 없음. error: 일시적 오류. */
  variant?: 'not-found' | 'error'
  /** error 화면의 "다시 시도" 등 추가 액션 슬롯(클라이언트 버튼 주입용). */
  action?: React.ReactNode
}

/** 아기자기한 라인 일러스트 — 노트북·책·연필·반짝임(브랜드 마젠타 포인트). */
function PreparingArt() {
  return (
    <svg
      viewBox="0 0 260 190"
      className="h-40 w-auto"
      fill="none"
      role="img"
      aria-label="콘텐츠 준비중 일러스트"
    >
      <g
        stroke="#94a3b8"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* 반짝임 */}
        <g stroke="#cbd5e1" strokeWidth="2.6">
          <path d="M120 26 l0 14 M113 33 l14 0" />
          <path d="M158 44 l0 11 M152.5 49.5 l11 0" />
          <path d="M92 52 l0 11 M86.5 57.5 l11 0" />
        </g>

        {/* 책 스택 (오른쪽) */}
        <rect x="176" y="104" width="58" height="15" rx="3" fill="#eaf1fa" stroke="#6aa0d8" />
        <path d="M176 111 h58" stroke="#6aa0d8" strokeWidth="1.6" />
        <rect x="182" y="119" width="52" height="15" rx="3" fill="#fbeadb" stroke="#e0975a" />
        <path d="M182 126.5 h52" stroke="#e0975a" strokeWidth="1.6" />

        {/* 노트북 */}
        <rect x="82" y="52" width="96" height="64" rx="7" fill="#ffffff" />
        <rect x="89" y="59" width="82" height="50" rx="4" fill="#fbfcfe" stroke="#cbd5e1" strokeWidth="1.8" />
        <path d="M66 116 h128 l10 15 a3 3 0 0 1 -3 4 H59 a3 3 0 0 1 -3 -4 Z" fill="#f1f5f9" />
        <path d="M116 124 h28" stroke="#cbd5e1" strokeWidth="2" />

        {/* 화면 속 마스코트 (마젠타) */}
        <g stroke="#E6007E" strokeWidth="2.6">
          <circle cx="130" cy="82" r="14" fill="#fff0f9" />
          <path d="M124 79.5 v2 M136 79.5 v2" strokeWidth="3.2" />
          <path d="M123.5 87 q6.5 6 13 0" />
        </g>

        {/* 연필 (왼쪽 아래 대각선) */}
        <g strokeLinejoin="round">
          <path d="M44 158 L84 122" stroke="#f2c14e" strokeWidth="7" />
          <path d="M84 122 l7 -6 5 9 -9 4 Z" fill="#f6d78b" stroke="#c99a2e" strokeWidth="1.8" />
          <path d="M96 125 l3 -2.6" stroke="#4b5563" strokeWidth="2.4" />
          <path d="M44 158 l-6 5" stroke="#f4a3c4" strokeWidth="7" />
        </g>
      </g>
    </svg>
  )
}

/**
 * 404/500 대신 노출하는 브랜드 "콘텐츠 준비중" 빈 상태 화면.
 * 대시보드 레이아웃(헤더·네비) 안에서 렌더되어 신뢰도를 유지한다.
 * 훅 없는 서버 안전 컴포넌트 — not-found.tsx(서버)·error.tsx(클라이언트) 양쪽에서 재사용.
 */
export default function ContentPreparing({ variant = 'not-found', action }: Props) {
  const sub =
    variant === 'error'
      ? '일시적인 문제로 화면을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'
      : '빠르고 편리한 서비스를 위해 항상 최선을 다하겠습니다.'

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center">
      <PreparingArt />
      <h1 className="mb-2 mt-6 text-xl font-bold text-foreground">콘텐츠 준비중...</h1>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{sub}</p>
      <div className="mt-6 flex items-center gap-2">
        {action}
        <PreparingBackButton />
      </div>
    </div>
  )
}
