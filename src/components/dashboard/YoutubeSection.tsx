import { YOUTUBE_VIDEOS, SERVICES, type YoutubeVideo } from './mock-data'

const SERVICE_GRADIENT: Record<string, string> = {
  AICC: 'from-pink-500 to-rose-600',
  Connectivity: 'from-blue-500 to-cyan-600',
  '보안/클라우드': 'from-indigo-500 to-violet-600',
  M2M: 'from-emerald-500 to-teal-600',
  AIDC: 'from-orange-500 to-amber-600',
  AIDC2: 'from-orange-500 to-amber-600',
  '모빌리티': 'from-sky-500 to-blue-600',
  '기업솔루션': 'from-purple-500 to-fuchsia-600',
  default: 'from-gray-500 to-gray-600',
}

function formatViewCount(count: string): string {
  const n = parseInt(count, 10)
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만회`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}천회`
  return `${n}회`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
}

interface Props {
  activeService?: string
}

export default function YoutubeSection({ activeService = 'all' }: Props) {
  const serviceLabel = activeService !== 'all'
    ? SERVICES.find((s) => s.id === activeService)?.label
    : null

  const videos: YoutubeVideo[] = serviceLabel
    ? YOUTUBE_VIDEOS.filter((v) => v.service === serviceLabel)
    : YOUTUBE_VIDEOS

  if (videos.length === 0) return null

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-red-600 text-[10px] font-bold text-white">▶</span>
          <h2 className="text-sm font-semibold text-gray-900">유튜브 영상</h2>
        </div>
        <button className="text-xs text-brand-600 hover:underline">전체 보기</button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {videos.map((video) => {
          const gradient = SERVICE_GRADIENT[video.service] ?? SERVICE_GRADIENT.default
          return (
            <div key={video.id} className="group cursor-pointer">
              {/* Thumbnail */}
              <div className={`relative mb-2.5 aspect-video overflow-hidden rounded-xl bg-gradient-to-br ${gradient}`}>
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm transition-transform group-hover:scale-110">
                    <svg className="h-5 w-5 translate-x-0.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                  <span className="rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                    {video.service}
                  </span>
                </div>
                {/* Channel badge */}
                <div className="absolute bottom-2 left-2">
                  <span className="rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white backdrop-blur-sm">
                    {video.snippet.channelTitle}
                  </span>
                </div>
              </div>

              {/* Info */}
              <p className="mb-1 line-clamp-2 text-xs font-medium leading-snug text-gray-900 group-hover:text-brand-600">
                {video.snippet.title}
              </p>
              <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                <span>{formatViewCount(video.statistics.viewCount)}</span>
                <span>·</span>
                <span>{formatDate(video.snippet.publishedAt)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
