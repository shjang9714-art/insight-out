'use client'

import { useEffect, useState } from 'react'
import BackLink from '@/components/BackLink'
import { createClient } from '@/lib/supabase/client'
import PageContainer from '@/components/PageContainer'
import ArchivesTab from '@/components/mypage/ArchivesTab'
import type { ArchiveWithItems } from '@/components/mypage/types'

// 492 · 3단계 D — 소프트 삭제된 콘텐츠는 "삭제된 콘텐츠" 표시 없이 목록에서 조용히 감춘다.
// SQL B(RLS) 적용 후에는 contents 가 null 로 오지만, 그 전(또는 admin 조회 등)에는
// deleted_at 이 채워진 채로 올 수 있어 두 경우 다 걸러야 카운트·목록이 어긋나지 않는다.
type ContentsJoin = { deleted_at?: string | null } | null

function isLiveContentJoin(contentId: string | null, contents: ContentsJoin): boolean {
  if (!contentId) return true // youtube_video_id/ai_report_id 기반 항목은 무관
  return Boolean(contents) && !contents!.deleted_at
}

function filterDeletedArchiveItems(archives: ArchiveWithItems[]): ArchiveWithItems[] {
  return archives.map((archive) => ({
    ...archive,
    items: archive.items.filter((item) => isLiveContentJoin(item.content_id, item.contents as ContentsJoin)),
  }))
}

export default function ArchivePage() {
  const supabase = createClient()

  const [archives, setArchives] = useState<ArchiveWithItems[]>([])
  const [archivesLoading, setArchivesLoading] = useState(true)
  const [expandedArchiveId, setExpandedArchiveId] = useState<string | null>(null)
  const [archiveError, setArchiveError] = useState<string | null>(null)
  const [sendingArchiveId, setSendingArchiveId] = useState<string | null>(null)
  const [sendResult, setSendResult] = useState<{ archiveId: string; to: string } | null>(null)
  const [emailInputArchiveId, setEmailInputArchiveId] = useState<string | null>(null)
  const [emailInputValue, setEmailInputValue] = useState('')
  const [authEmail, setAuthEmail] = useState('')

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setArchivesLoading(false)
        return
      }

      setAuthEmail(user.email ?? '')

      const { data, error } = await supabase
        .from('archives')
        .select(`id, name, description, created_at, items:archive_items(content_id, youtube_video_id, ai_report_id, added_at, contents(id, title, category, original_url, deleted_at), ai_reports(id, title, type, published_at))`)
        .order('created_at', { ascending: false })

      if (error) setArchiveError('아카이브를 불러오지 못했습니다.')
      if (data) setArchives(filterDeletedArchiveItems(data as unknown as ArchiveWithItems[]))
      setArchivesLoading(false)
    }

    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleDeleteArchive(archiveId: string) {
    if (!window.confirm('아카이브를 삭제하면 담긴 항목도 모두 사라집니다. 계속할까요?')) return
    setArchiveError(null)
    const { error } = await supabase.from('archives').delete().eq('id', archiveId)
    if (error) {
      setArchiveError('삭제에 실패했습니다. 잠시 후 다시 시도해주세요.')
    } else {
      setArchives((prev) => prev.filter((archive) => archive.id !== archiveId))
      if (expandedArchiveId === archiveId) setExpandedArchiveId(null)
    }
  }

  async function handleRemoveItem(
    archiveId: string,
    contentId: string | null,
    youtubeId: string | null,
    reportId: string | null = null
  ) {
    setArchiveError(null)
    let query = supabase.from('archive_items').delete().eq('archive_id', archiveId)
    if (contentId) query = query.eq('content_id', contentId)
    else if (reportId) query = query.eq('ai_report_id', reportId)
    else if (youtubeId) query = query.eq('youtube_video_id', youtubeId)

    const { error } = await query
    if (error) {
      setArchiveError('항목 제거에 실패했습니다.')
    } else {
      setArchives((prev) =>
        prev.map((archive) =>
          archive.id === archiveId
            ? {
                ...archive,
                items: archive.items.filter((item) =>
                  contentId
                    ? item.content_id !== contentId
                    : reportId
                      ? item.ai_report_id !== reportId
                      : item.youtube_video_id !== youtubeId
                ),
              }
            : archive
        )
      )
    }
  }

  async function handleSendEmail(archiveId: string, recipientsInput?: string) {
    setSendingArchiveId(archiveId)
    setArchiveError(null)
    setSendResult(null)
    const recipients = recipientsInput
      ? recipientsInput.split(/[,;\s]+/).map((email) => email.trim()).filter(Boolean)
      : []

    try {
      const res = await fetch('/api/email/send-archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archiveId, recipients }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '발송에 실패했습니다.')
      setSendResult({ archiveId, to: data.to })
      setEmailInputArchiveId(null)
      setEmailInputValue('')
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : '이메일 발송에 실패했습니다.')
    } finally {
      setSendingArchiveId(null)
    }
  }

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8">
          <BackLink
            fallbackHref="/dashboard"
            className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-brand-600"
          />
          <h1 className="text-xl font-bold text-foreground">아카이브</h1>
          <p className="mt-1 text-sm text-muted-foreground">담아둔 콘텐츠 모음입니다. 아카이브 단위로 이메일로 받아볼 수 있습니다.</p>
        </div>

        <ArchivesTab
          archives={archives}
          loading={archivesLoading}
          error={archiveError}
          expandedArchiveId={expandedArchiveId}
          setExpandedArchiveId={setExpandedArchiveId}
          sendingArchiveId={sendingArchiveId}
          sendResult={sendResult}
          emailInputArchiveId={emailInputArchiveId}
          setEmailInputArchiveId={setEmailInputArchiveId}
          emailInputValue={emailInputValue}
          setEmailInputValue={setEmailInputValue}
          defaultEmail={authEmail}
          onDeleteArchive={handleDeleteArchive}
          onRemoveItem={handleRemoveItem}
          onSendEmail={handleSendEmail}
          clearSendResult={() => setSendResult(null)}
        />
      </div>
    </PageContainer>
  )
}
