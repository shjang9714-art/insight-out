interface KeywordSparklineProps {
  points: { date: string; count: number }[]
  label: string
}

const WIDTH = 52
const HEIGHT = 24
const PADDING = 2

export default function KeywordSparkline({ points, label }: KeywordSparklineProps) {
  if (points.length < 2) return null
  const values = points.map(point => point.count)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = Math.max(1, max - min)
  const coordinates = points.map((point, index) => {
    const x = PADDING + (index / (points.length - 1)) * (WIDTH - PADDING * 2)
    const y = HEIGHT - PADDING - ((point.count - min) / range) * (HEIGHT - PADDING * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-6 w-[3.25rem] text-brand-600"
      role="img"
      aria-label={`${label} 최근 7일 추이: ${values.join(', ')}건`}
    >
      <polyline
        points={coordinates}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
