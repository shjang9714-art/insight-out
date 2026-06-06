import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Link from 'next/link'

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface VideoRow {
  id: string
  video_id: string
  title: string
  channel_name: string
  thumbnail_url: string | null
  published_at: string | null
}

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
  })
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default async function YoutubeSection() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: rawVideos } = await supabase
    .from('youtube_videos')
    .select('id, video_id, title, channel_name, thumbnail_url, published_at')
    .order('published_at', { ascending: false })
    .limit(6)

  const videos = (rawVideos ?? []) as VideoRow[]

  // 영상 없으면 섹션 숨김
  if (videos.length === 0) return null

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5">
      {/* 섹션 헤더 */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-red-600 text-[10px] font-bold text-white">
            ▶
          </span>
          <h2 className="text-sm font-semibold text-gray-900">유튜브 영상</h2>
        </div>
        <Link
          href="/dashboard/youtube"
          className="text-xs text-brand-600 hover:underline"
        >
          전체 보기
        </Link>
      </div>

      {/* 카드 그리드 */}
      <div className="grid grid-cols-3 gap-4">
        {videos.map((video) => {
          const watchUrl = `https://www.youtube.com/watch?v=${video.video_id}`
          return (
            <a
              key={video.id}
              href={watchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group block"
            >
              {/* 썸네일 */}
              <div className="relative mb-2.5 overflow-hidden rounded-xl bg-gray-100">
                {video.thumbnail_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={video.thumbnail_url}
                    alt={video.title}
                    className="aspect-video w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex aspect-video w-full items-center justify-center bg-gray-200">
                    <svg className="h-8 w-8 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                )}
              </div>

              {/* 제목·메타 */}
              <p className="mb-1 line-clamp-2 text-xs font-medium leading-snug text-gray-900 group-hover:text-brand-600">
                {video.title}
              </p>
              <div className="flex items-center gap-1 text-[11px] text-gray-400">
                <span className="truncate">{video.channel_name}</span>
                {video.published_at && (
                  <>
                    <span>·</span>
                    <span className="shrink-0">{formatDate(video.published_at)}</span>
                  </>
                )}
              </div>
            </a>
          )
        })}
      </div>
    </div>
  )
}
