import Link from 'next/link'
import { LogIn } from 'lucide-react'
import BookmarkButton from '@/components/bookmark/BookmarkButton'
import ArchiveButton from '@/components/archive/ArchiveButton'

interface LoginGatedActionsProps {
  isLoggedIn: boolean
  contentId?: string
  reportId?: string
}

/**
 * 뉴스레터 비로그인 공개 뷰(지시서 20260723)에서 북마크·아카이빙 담기는
 * 로그인 사용자 전용 기능이라 anon 방문자에겐 실패하는 fetch 대신
 * 로그인 유도 링크로 대체한다.
 */
export default function LoginGatedActions({ isLoggedIn, contentId, reportId }: LoginGatedActionsProps) {
  if (!isLoggedIn) {
    return (
      <Link
        href="/login"
        className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-brand-600 hover:text-brand-600"
      >
        <LogIn className="h-4 w-4" />
        로그인하고 담기
      </Link>
    )
  }

  return (
    <>
      <BookmarkButton contentId={contentId} reportId={reportId} />
      <ArchiveButton contentId={contentId} reportId={reportId} />
    </>
  )
}
