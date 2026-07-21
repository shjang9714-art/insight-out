'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { sendNewsletterNow, getPreviewHtml } from '@/app/admin/newsletter/actions'

export default function NewsletterSendPanel() {
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const [sendStatus, setSendStatus] = useState<'idle' | 'sending'>('idle')
  const [sendResult, setSendResult] = useState<string | null>(null)

  const handlePreview = async () => {
    setPreviewLoading(true)
    const result = await getPreviewHtml()
    if ('error' in result && result.error) {
      alert(result.error)
    } else if ('html' in result) {
      setPreviewHtml(result.html ?? null)
    }
    setPreviewLoading(false)
  }

  const handleSendNow = async () => {
    if (!window.confirm('지금 바로 뉴스레터를 발송하시겠습니까?')) return
    setSendStatus('sending')
    setSendResult(null)

    const result = await sendNewsletterNow()
    if ('error' in result && result.error) {
      setSendResult(`오류: ${result.error}`)
    } else if ('skipped' in result && result.skipped) {
      setSendResult(`건너뜀: ${result.skipped}`)
    } else if ('sent' in result) {
      setSendResult(`발송 완료 — ${result.sent}명 성공, ${result.failed}명 실패`)
    }
    setSendStatus('idle')
  }

  return (
    <div>
      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={handlePreview}
          disabled={previewLoading}
          className="flex-1 h-10"
        >
          {previewLoading ? '생성 중...' : '미리보기'}
        </Button>
        <Button
          type="button"
          onClick={handleSendNow}
          disabled={sendStatus === 'sending'}
          className="flex-1 h-10"
        >
          {sendStatus === 'sending' ? '발송 중...' : '지금 발송'}
        </Button>
      </div>

      {sendResult && (
        <p className={cn(
          'mt-3 rounded-lg px-3 py-2 text-sm',
          sendResult.startsWith('오류') ? 'bg-negative-soft text-negative' : 'bg-positive-soft text-positive'
        )}>
          {sendResult}
        </p>
      )}

      {previewHtml && (
        <div className="mt-4">
          <p className="mb-2 text-xs text-muted-foreground">미리보기 (실제 메일 렌더링)</p>
          <iframe
            srcDoc={previewHtml}
            className="w-full rounded-lg border border-border"
            style={{ height: '600px' }}
            title="뉴스레터 미리보기"
          />
        </div>
      )}
    </div>
  )
}
