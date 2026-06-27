import { cn } from '@/lib/utils'

interface YoutubeVideoCardProps {
  title: string
  originalUrl: string | null
  sourceName: string | null
  publishedAt: string | null
  className?: string
}

function extractVideoId(url: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtube.com')) return u.searchParams.get('v')
    if (u.hostname === 'youtu.be') return u.pathname.slice(1)
  } catch {
    // 잘못된 URL 무시
  }
  return null
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default function YoutubeVideoCard({
  title,
  originalUrl,
  sourceName,
  publishedAt,
  className,
}: YoutubeVideoCardProps) {
  const videoId = extractVideoId(originalUrl)
  const thumbnailUrl = videoId
    ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
    : null
  const watchUrl = originalUrl ?? '#'

  return (
    <a
      href={watchUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('group block', className)}
    >
      {/* 썸네일 */}
      <div className="relative mb-3 overflow-hidden rounded-xl bg-muted">
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl}
            alt={title}
            className="aspect-video w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center bg-muted">
            <svg className="h-10 w-10 text-muted-foreground" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        )}
        {/* 재생 오버레이 */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
            <svg className="h-6 w-6 translate-x-0.5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>

      {/* 제목 */}
      <p className="mb-1.5 line-clamp-2 text-sm font-medium leading-snug text-foreground group-hover:text-brand-600">
        {title}
      </p>

      {/* 채널명 · 날짜 */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {sourceName && <span className="truncate font-medium">{sourceName}</span>}
        {sourceName && publishedAt && <span>·</span>}
        {publishedAt && <span className="shrink-0">{formatDate(publishedAt)}</span>}
      </div>
    </a>
  )
}
