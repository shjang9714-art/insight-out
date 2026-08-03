'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

export type ConfirmOptions = {
  title: string
  description?: string
  targets?: string[]
  loadCount?: () => Promise<number>
  confirmLabel?: string
  destructive?: boolean
}

type Request = ConfirmOptions & { resolve: (value: boolean) => void }

const AdminConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null)

export function useAdminConfirm() {
  const confirm = useContext(AdminConfirmContext)
  if (!confirm) throw new Error('AdminConfirmHost가 필요합니다.')
  return confirm
}

export function AdminConfirmHost({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null)
  const [count, setCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)

  const confirm = (options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    setRequest({ ...options, resolve })
    setCount(null)
    if (options.loadCount) {
      setLoading(true)
      options.loadCount().then(setCount).catch(() => setCount(null)).finally(() => setLoading(false))
    }
  })

  const close = (result: boolean) => {
    request?.resolve(result)
    setRequest(null)
  }

  const load = () => {
    if (!request?.loadCount) return
    setLoading(true)
    request.loadCount().then(setCount).catch(() => setCount(null)).finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!request) return
    cancelRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [request])

  return (
    <AdminConfirmContext.Provider value={confirm}>
      {children}
      {request && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl ring-1 ring-foreground/10">
            <h2 className="text-lg font-semibold">{request.title}</h2>
            {request.description && <p className="mt-2 text-sm text-muted-foreground">{request.description}</p>}
            {request.targets && request.targets.length > 0 && (
              <div className="mt-3 rounded-lg bg-muted/50 p-3 text-sm">
                <p className="font-medium">대상</p>
                <ul className="mt-1 list-inside list-disc">
                  {request.targets.slice(0, 10).map((target, index) => <li key={index}>{target}</li>)}
                </ul>
                {request.targets.length > 10 && <p className="mt-1 text-muted-foreground">외 {request.targets.length - 10}건</p>}
              </div>
            )}
            {request.loadCount && <p className="mt-3 text-sm">삭제 대상: {loading ? '조회 중...' : count === null ? '확인할 수 없습니다.' : `${count.toLocaleString()}건`}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button ref={cancelRef} type="button" variant="outline" onClick={() => close(false)}>취소</Button>
              {request.loadCount && count === null && !loading && (
                <Button type="button" variant="outline" onClick={load}>다시 시도</Button>
              )}
              <Button type="button" variant={request.destructive ? 'destructive' : 'default'} onClick={() => close(true)} disabled={loading || (Boolean(request.loadCount) && count === null)}>
                {request.confirmLabel ?? '확인'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AdminConfirmContext.Provider>
  )
}
