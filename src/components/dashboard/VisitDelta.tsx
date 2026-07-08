import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { getCachedUser } from '@/lib/supabase/cached-user'
import MarkSeen from './MarkSeen'

export default async function VisitDelta() {
  const user = await getCachedUser()
  if (!user) return null

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    },
  )

  // 직전 방문 시각 조회 (42703 graceful)
  const { data: profile, error: profErr } = await supabase
    .from('users')
    .select('last_seen_at')
    .eq('id', user.id)
    .single()

  if (profErr) return <MarkSeen />

  const lastSeen = (profile as { last_seen_at: string | null } | null)?.last_seen_at
  if (!lastSeen) return <MarkSeen />

  // 새 콘텐츠·이슈 카운트 (published, 직전 방문 이후)
  const [contentRes, issueRes] = await Promise.all([
    supabase
      .from('contents')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'published')
      .gt('collected_at', lastSeen),
    supabase
      .from('issues')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'published')
      .gt('created_at', lastSeen),
  ])

  const newContent = contentRes.count ?? 0
  const newIssues  = issueRes.count ?? 0

  if (newContent === 0 && newIssues === 0) return <MarkSeen />

  const cap = (n: number) => (n > 99 ? '99+' : String(n))

  return (
    <>
      <Link
        href="/dashboard/contents"
        className="flex items-center gap-2 rounded-xl border border-brand-600/30 bg-brand-600/5 px-4 py-2.5 text-sm text-foreground transition-colors hover:border-brand-600/50"
      >
        <Sparkles className="h-4 w-4 text-brand-600 shrink-0" />
        <span>
          지난 방문 이후 새 콘텐츠 <b className="tabular-nums">{cap(newContent)}</b>건
          {newIssues > 0 && <> · 새 이슈 <b className="tabular-nums">{cap(newIssues)}</b>건</>}
        </span>
      </Link>
      <MarkSeen />
    </>
  )
}
