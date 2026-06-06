import type { Metadata } from 'next'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '유튜브 영상 | Insight Out',
  description: 'B2B 서비스 관련 유튜브 영상 모음',
}

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
  if (!iso) return '날짜 없음'
  return new Date(iso).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// ─── 카드 ─────────────────────────────────────────────────────────────────────

function VideoCard({ video }: { video: VideoRow }) {
  const watchUrl = `https://www.youtube.com/watch?v=${video.video_id}`
  return (
    <a
      href={watchUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group block"
    >
      {/* 썸네일 */}
      <div className="relative mb-3 overflow-hidden rounded-2xl bg-gray-100">
        {video.thumbnail_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={video.thumbnail_url}
            alt={video.title}
            className="aspect-video w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          /* 썸네일 없을 때 폴백 */
          <div className="flex aspect-video w-full items-center justify-center bg-gray-200">
            <svg className="h-10 w-10 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
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

      {/* 정보 */}
      <p className="mb-1.5 line-clamp-2 text-sm font-medium leading-snug text-gray-900 group-hover:text-brand-600">
        {video.title}
      </p>
      <div className="flex items-center gap-1.5 text-xs text-gray-400">
        <span className="font-medium text-gray-500">{video.channel_name}</span>
        <span>·</span>
        <span>{formatDate(video.published_at)}</span>
      </div>
    </a>
  )
}

// ─── 페이지 ───────────────────────────────────────────────────────────────────

export default async function YoutubePage() {
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

  const { data: rawVideos, error } = await supabase
    .from('youtube_videos')
    .select('id, video_id, title, channel_name, thumbnail_url, published_at')
    .order('published_at', { ascending: false })
    .limit(60)

  if (error) {
    console.error('[유튜브 페이지] youtube_videos 조회 오류:', error.message)
  }

  const videos = (rawVideos ?? []) as VideoRow[]

  return (
    <div className="px-4 py-6 sm:px-6">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2 text-sm text-gray-400">
        <Link href="/dashboard" className="transition-colors hover:text-brand-600">
          대시보드
        </Link>
        <span>›</span>
        <span className="font-medium text-gray-700">유튜브 영상</span>
      </div>

      {/* 헤더 */}
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-600 text-sm font-bold text-white">
          ▶
        </span>
        <div>
          <h1 className="text-lg font-bold text-gray-900">유튜브 영상</h1>
          <p className="text-xs text-gray-400">전체 · {videos.length}개 영상</p>
        </div>
      </div>

      {/* 영상 그리드 */}
      {videos.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-200 bg-white py-20 text-center">
          <span className="text-4xl">📭</span>
          <p className="text-sm font-medium text-gray-500">아직 수집된 유튜브 영상이 없습니다.</p>
          <p className="text-xs text-gray-400">어드민에서 유튜브 채널 소스를 추가하세요.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {videos.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      )}
    </div>
  )
}
