import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Link from 'next/link'
import ContentCard from '@/components/dashboard/ContentCard'
import { coverUrlsForList } from '@/lib/contents/topic-cover'
import { tagsOf2 } from '@/lib/contents/excerpt'

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface VideoRow {
  id: string
  title: string
  summary_ko: string | null
  original_url: string | null
  thumbnail_url: string | null
  matched_groups: string[] | null
  matched_keywords: string[] | null
  published_at: string | null
  sources: { name: string } | null
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
    .from('contents')
    .select('id, title, summary_ko, original_url, thumbnail_url, matched_groups, matched_keywords, published_at, sources(name)')
    .eq('category', '유튜브')
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(6)

  const videos = (rawVideos ?? []) as unknown as VideoRow[]

  // 영상 없으면 섹션 숨김
  if (videos.length === 0) return null

  const videoCoverUrls = coverUrlsForList(videos.map((video) => ({ ...video, category: '유튜브' })))

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      {/* 섹션 헤더 */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-red-600 text-[10px] font-bold text-white">
            ▶
          </span>
          <h2 className="text-sm font-semibold text-foreground">유튜브 영상</h2>
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
        {videos.map((video, index) => (
          <ContentCard
            key={video.id}
            id={video.id}
            title={video.title}
            summaryKo={video.summary_ko ?? null}
            category="유튜브"
            sourceName={video.sources?.name ?? null}
            publishedAt={video.published_at}
            thumbnailUrl={videoCoverUrls[index]}
            externalHref={video.original_url}
            keywords={tagsOf2(video.matched_groups ?? [], video.matched_keywords ?? [], '유튜브')}
          />
        ))}
      </div>
    </div>
  )
}
