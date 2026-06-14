import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { ChevronLeft } from 'lucide-react'
import BriefingArchive from '@/components/dashboard/BriefingArchive'

export const metadata: Metadata = {
  title: '지난 브리핑 | Insight Out',
  description: '공개된 모닝브리핑을 다시 듣고 스크립트를 확인하세요.',
}

export default async function BriefingsPage() {
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

  const { data } = await supabase
    .from('briefings')
    .select('id, briefing_date, title, script, audio_url, audio_duration_seconds, voice, status')
    .in('status', ['published', 'archived'])
    .order('briefing_date', { ascending: false })
    .limit(90)

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          대시보드로 돌아가기
        </Link>
        <h1 className="mt-3 text-xl font-bold text-foreground">지난 브리핑</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          공개된 모닝브리핑을 다시 듣고 스크립트를 확인하세요.
        </p>
      </div>

      <BriefingArchive briefings={data ?? []} />
    </div>
  )
}
