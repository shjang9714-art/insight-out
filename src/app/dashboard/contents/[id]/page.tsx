import { notFound } from 'next/navigation'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { Metadata } from 'next'
import { ExternalLink, ArrowLeft } from 'lucide-react'
import { ensureFullBody } from '@/lib/contents/full-body'
import { CONTENT_CATEGORY_LABEL, type ContentCategory } from '@/lib/types'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface ContentDetail {
  id: string
  title: string
  category: ContentCategory
  body_original: string | null
  body_fetched_at: string | null
  original_url: string | null
  author: string | null
  published_at: string | null
  sources: { name: string } | null
  content_services: { services: { name: string } | null }[]
  content_keywords: { keywords: { name: string } | null }[]
}

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

function formatDate(d: string | null) {
  if (!d) return null
  return new Date(d).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function createSupabaseClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(toSet) {
          toSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}

const CATEGORY_STYLE: Partial<Record<ContentCategory, string>> = {
  '뉴스':      'bg-blue-50 text-blue-700 border-blue-100',
  '가트너':    'bg-purple-50 text-purple-700 border-purple-100',
  'KRG':      'bg-orange-50 text-orange-700 border-orange-100',
  '웹인사이트': 'bg-teal-50 text-teal-700 border-teal-100',
  '오피니언':  'bg-green-50 text-green-700 border-green-100',
  '뉴스레터':  'bg-indigo-50 text-indigo-700 border-indigo-100',
  'AI보고서':  'bg-pink-50 text-pink-700 border-pink-100',
  '유튜브':    'bg-red-50 text-red-700 border-red-100',
}

// ─── 메타데이터 ───────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const cookieStore = await cookies()
  const supabase = createSupabaseClient(cookieStore)

  const { data } = await supabase
    .from('contents')
    .select('title')
    .eq('id', id)
    .single()

  const title = data?.title ?? '콘텐츠 상세'
  return {
    title: `${title} | Insight Out`,
    description: title,
  }
}

// ─── 페이지 ───────────────────────────────────────────────────────────────────

export default async function ContentDetailPage({ params }: PageProps) {
  const { id } = await params
  const cookieStore = await cookies()
  const supabase = createSupabaseClient(cookieStore)

  const { data, error } = await supabase
    .from('contents')
    .select(`
      id, title, category,
      body_original, body_fetched_at,
      original_url, author, published_at,
      sources(name),
      content_services(services(name)),
      content_keywords(keywords(name))
    `)
    .eq('id', id)
    .eq('status', 'published')
    .single()

  if (error || !data) {
    notFound()
  }

  const content = data as unknown as ContentDetail

  const body = await ensureFullBody({
    ...content,
    source_id: null,
    title_original: null,
    summary_ko: null,
    body_translated_ko: null,
    original_language: 'ko',
    thumbnail_url: null,
    file_path: null,
    title_hash: null,
    body_hash: null,
    view_count: 0,
    bookmark_count: 0,
    is_editor_pick: false,
    cluster_id: null,
    status: 'published',
    collected_at: '',
    created_at: '',
    updated_at: '',
  })

  const catStyle =
    CATEGORY_STYLE[content.category] ?? 'bg-gray-50 text-gray-600 border-gray-100'

  const serviceNames = content.content_services
    .map((cs) => cs.services?.name)
    .filter(Boolean) as string[]

  const keywordNames = content.content_keywords
    .map((ck) => ck.keywords?.name)
    .filter(Boolean) as string[]

  const dateStr = formatDate(content.published_at)

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">

      {/* 브레드크럼 */}
      <div className="mb-6 flex items-center gap-2 text-sm text-gray-400">
        <Link href="/dashboard" className="transition-colors hover:text-brand-600">
          대시보드
        </Link>
        <span>›</span>
        <Link href="/dashboard/contents" className="transition-colors hover:text-brand-600">
          전체 콘텐츠
        </Link>
        <span>›</span>
        <span className="line-clamp-1 max-w-[200px] font-medium text-gray-700">
          {content.title}
        </span>
      </div>

      <article>
        {/* 카테고리 뱃지 */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${catStyle}`}
          >
            {CONTENT_CATEGORY_LABEL[content.category] ?? content.category}
          </span>
        </div>

        {/* 제목 */}
        <h1 className="mb-4 text-xl font-bold leading-snug text-gray-900">
          {content.title}
        </h1>

        {/* 메타 라인 */}
        <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
          {content.sources?.name && (
            <span className="font-medium text-gray-700">{content.sources.name}</span>
          )}
          {content.author && (
            <span>{content.author}</span>
          )}
          {dateStr && <span>{dateStr}</span>}
        </div>

        {/* 서비스·키워드 태그 */}
        {(serviceNames.length > 0 || keywordNames.length > 0) && (
          <div className="mb-6 flex flex-wrap gap-1.5">
            {serviceNames.map((name) => (
              <span
                key={name}
                className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-medium text-brand-700"
              >
                {name}
              </span>
            ))}
            {keywordNames.map((name) => (
              <span
                key={name}
                className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] text-gray-600"
              >
                #{name}
              </span>
            ))}
          </div>
        )}

        {/* 구분선 */}
        <div className="mb-6 border-t border-gray-100" />

        {/* 본문 */}
        {body ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
            {body}
          </p>
        ) : (
          <p className="text-sm text-gray-400">본문 내용을 불러올 수 없습니다.</p>
        )}

        {/* 하단 액션 */}
        <div className="mt-10 flex items-center justify-between border-t border-gray-100 pt-6">
          <Link
            href="/dashboard/contents"
            className="flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-brand-600"
          >
            <ArrowLeft className="h-4 w-4" />
            목록으로
          </Link>

          {content.original_url && (
            <a
              href={content.original_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-brand-600 hover:text-brand-600"
            >
              <ExternalLink className="h-4 w-4" />
              원문 보기
            </a>
          )}
        </div>
      </article>
    </div>
  )
}
