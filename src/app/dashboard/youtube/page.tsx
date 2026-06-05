'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { YOUTUBE_VIDEOS, SERVICES, type YoutubeVideo } from '@/components/dashboard/mock-data'

const SERVICE_GRADIENT: Record<string, string> = {
  AICC: 'from-pink-500 to-rose-600',
  Connectivity: 'from-blue-500 to-cyan-600',
  '보안/클라우드': 'from-indigo-500 to-violet-600',
  M2M: 'from-emerald-500 to-teal-600',
  AIDC: 'from-orange-500 to-amber-600',
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
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
}

function VideoCard({ video }: { video: YoutubeVideo }) {
  const gradient = SERVICE_GRADIENT[video.service] ?? SERVICE_GRADIENT.default
  return (
    <div className="group cursor-pointer">
      <div className={`relative mb-3 aspect-video overflow-hidden rounded-2xl bg-gradient-to-br ${gradient}`}>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm transition-transform group-hover:scale-110">
            <svg className="h-6 w-6 translate-x-0.5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
          <span className="rounded-lg bg-black/50 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
            {video.snippet.channelTitle}
          </span>
          <span className="rounded-lg bg-brand-600/90 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
            {video.service}
          </span>
        </div>
      </div>
      <p className="mb-1.5 line-clamp-2 text-sm font-medium leading-snug text-gray-900 group-hover:text-brand-600">
        {video.snippet.title}
      </p>
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <span>{formatViewCount(video.statistics.viewCount)}</span>
        <span>·</span>
        <span>{formatDate(video.snippet.publishedAt)}</span>
      </div>
      {video.snippet.tags && (
        <div className="mt-2 flex flex-wrap gap-1">
          {video.snippet.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">
              #{tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function YoutubeContent() {
  const searchParams = useSearchParams()
  const activeService = searchParams.get('service') ?? 'all'

  const serviceLabel =
    activeService !== 'all' ? SERVICES.find((s) => s.id === activeService)?.label : null

  const videos = serviceLabel
    ? YOUTUBE_VIDEOS.filter((v) => v.service === serviceLabel)
    : YOUTUBE_VIDEOS

  const dashboardHref =
    activeService !== 'all' ? `/dashboard?service=${activeService}` : '/dashboard'

  return (
    <div className="px-4 py-6 sm:px-6">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2 text-sm text-gray-400">
        <Link href={dashboardHref} className="transition-colors hover:text-brand-600">
          대시보드
        </Link>
        <span>›</span>
        <span className="font-medium text-gray-700">유튜브 영상</span>
        {serviceLabel && (
          <>
            <span>›</span>
            <span className="font-medium text-brand-600">{serviceLabel}</span>
          </>
        )}
      </div>

      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-600 text-sm font-bold text-white">
          ▶
        </span>
        <div>
          <h1 className="text-lg font-bold text-gray-900">유튜브 영상</h1>
          <p className="text-xs text-gray-400">
            {serviceLabel ? `${serviceLabel} 서비스 기준` : '전체'} · {videos.length}개 영상
          </p>
        </div>
      </div>

      {/* Video grid — 서비스 필터 탭 없음, 사이드바로 제어 */}
      {videos.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-gray-100 bg-white py-20">
          <span className="text-4xl">📭</span>
          <p className="text-sm font-medium text-gray-500">해당 서비스의 영상이 없습니다</p>
          <p className="text-xs text-gray-400">사이드바에서 다른 서비스를 선택해보세요</p>
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

export default function YoutubePage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-400">로딩 중...</div>}>
      <YoutubeContent />
    </Suspense>
  )
}
