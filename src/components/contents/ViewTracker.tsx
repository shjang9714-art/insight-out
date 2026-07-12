'use client'

import { useEffect, useRef } from 'react'

const CONTENT_VIEWS_ENDPOINT = '/api/content_views'

interface ViewTrackerProps {
  contentId: string
}

interface CreateContentViewResponse {
  id?: unknown
}

function toDwellSeconds(milliseconds: number) {
  return Math.max(0, Math.round(milliseconds / 1000))
}

async function readResponseMessage(response: Response) {
  try {
    return await response.text()
  } catch {
    return ''
  }
}

export default function ViewTracker({ contentId }: ViewTrackerProps) {
  const trackedContentIdRef = useRef<string | null>(null)
  const startedRef = useRef(false)
  const sentRef = useRef(false)
  const viewIdRef = useRef<string | null>(null)
  const visibleStartedAtRef = useRef<number | null>(null)
  const visibleMillisecondsRef = useRef(0)
  const sessionRef = useRef(0)

  useEffect(() => {
    if (trackedContentIdRef.current !== contentId) {
      trackedContentIdRef.current = contentId
      startedRef.current = false
      sentRef.current = false
      viewIdRef.current = null
      visibleStartedAtRef.current = null
      visibleMillisecondsRef.current = 0
      sessionRef.current += 1
    }

    const session = sessionRef.current

    const startVisibleTimer = () => {
      if (visibleStartedAtRef.current === null) {
        visibleStartedAtRef.current = performance.now()
      }
    }

    const stopVisibleTimer = () => {
      if (visibleStartedAtRef.current === null) return
      visibleMillisecondsRef.current += Math.max(
        0,
        performance.now() - visibleStartedAtRef.current
      )
      visibleStartedAtRef.current = null
    }

    const getDwellSeconds = () => {
      const visibleNow =
        document.visibilityState === 'visible' &&
        visibleStartedAtRef.current !== null

      const currentVisibleMilliseconds = visibleNow
        ? Math.max(0, performance.now() - visibleStartedAtRef.current!)
        : 0

      return toDwellSeconds(
        visibleMillisecondsRef.current + currentVisibleMilliseconds
      )
    }

    const patchDwellSeconds = (reason: string) => {
      const viewId = viewIdRef.current
      if (!viewId || sentRef.current) return

      sentRef.current = true

      fetch(CONTENT_VIEWS_ENDPOINT, {
        method: 'PATCH',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: viewId,
          dwell_seconds: getDwellSeconds(),
        }),
      })
        .then(async (response) => {
          if (!response.ok) {
            const message = await readResponseMessage(response)
            throw new Error(
              message || `HTTP ${response.status} ${response.statusText}`
            )
          }
        })
        .catch((error) => {
          console.error(`[content_views] 체류 시간 갱신 실패(${reason}):`, error)
        })
    }

    if (document.visibilityState === 'visible') {
      startVisibleTimer()
    }

    if (!startedRef.current) {
      startedRef.current = true

      fetch(CONTENT_VIEWS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_id: contentId }),
      })
        .then(async (response) => {
          if (!response.ok) {
            const message = await readResponseMessage(response)
            throw new Error(
              message || `HTTP ${response.status} ${response.statusText}`
            )
          }

          const body = (await response.json()) as CreateContentViewResponse
          if (typeof body.id !== 'string') {
            throw new Error('응답에 조회 기록 id가 없습니다.')
          }

          if (
            sessionRef.current === session &&
            trackedContentIdRef.current === contentId
          ) {
            viewIdRef.current = body.id
          }
        })
        .catch((error) => {
          console.error('[content_views] 조회 기록 생성 실패:', error)
        })
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        stopVisibleTimer()
        patchDwellSeconds('visibilitychange')
        return
      }

      sentRef.current = false
      startVisibleTimer()
    }

    const handlePageHide = () => {
      stopVisibleTimer()
      patchDwellSeconds('pagehide')
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', handlePageHide)
      stopVisibleTimer()
      patchDwellSeconds('unmount')
    }
  }, [contentId])

  return null
}
