'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getDocument, GlobalWorkerOptions, TextLayer } from 'pdfjs-dist'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { AlertTriangle, Download, Loader2 } from 'lucide-react'
import './pdf-text-layer.css'

GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

// 동시 렌더는 1~2장으로 제한(307 §3-2) — 42페이지 전부 그리면 메모리·렌더가 터진다.
const MAX_CONCURRENT_RENDERS = 2
// 보이는 페이지 + 앞뒤 1~2장 미리 렌더
const PRELOAD_ROOT_MARGIN = '150% 0px'

class RenderSemaphore {
  private active = 0
  private queue: Array<() => void> = []
  constructor(private readonly max: number) {}

  acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++
      return Promise.resolve()
    }
    return new Promise((resolve) => this.queue.push(resolve))
  }

  release() {
    const next = this.queue.shift()
    if (next) {
      next()
    } else {
      this.active = Math.max(0, this.active - 1)
    }
  }
}

interface PdfViewerProps {
  contentId: string
  initialUrl: string
  downloadUrl: string
  downloadFileName: string
}

interface PageDim {
  width: number
  height: number
}

export default function PdfViewer({ contentId, initialUrl, downloadUrl, downloadFileName }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const docRef = useRef<PDFDocumentProxy | null>(null)
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null)
  const retriedRef = useRef(false)
  const semaphore = useMemo(() => new RenderSemaphore(MAX_CONCURRENT_RENDERS), [])

  const [containerWidth, setContainerWidth] = useState(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [pageDims, setPageDims] = useState<PageDim[]>([])
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    let cancelled = false
    retriedRef.current = false

    async function load(url: string): Promise<void> {
      try {
        const loadingTask = getDocument({ url })
        loadingTaskRef.current = loadingTask
        const doc = await loadingTask.promise
        if (cancelled) return
        docRef.current = doc

        const dims: PageDim[] = []
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i)
          const viewport = page.getViewport({ scale: 1 })
          dims.push({ width: viewport.width, height: viewport.height })
        }
        if (cancelled) return
        setPageDims(dims)
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        if (!retriedRef.current) {
          retriedRef.current = true
          try {
            const res = await fetch(`/api/contents/${contentId}/report-url`)
            if (res.ok) {
              const { url: freshUrl } = (await res.json()) as { url?: string }
              if (freshUrl) {
                await load(freshUrl)
                return
              }
            }
          } catch {
            // 재발급도 실패 — 아래에서 에러 처리
          }
        }
        if (cancelled) return
        console.error('[PdfViewer] PDF 문서 로드 실패', err)
        setStatus('error')
      }
    }

    load(initialUrl)

    return () => {
      cancelled = true
      loadingTaskRef.current?.destroy()
      docRef.current = null
    }
  }, [initialUrl, contentId])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width) setContainerWidth(width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const getPage = useCallback((pageNumber: number): Promise<PDFPageProxy> => {
    if (!docRef.current) throw new Error('PDF 문서가 아직 로드되지 않았습니다.')
    return docRef.current.getPage(pageNumber)
  }, [])

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {status === 'ready' ? `${currentPage} / ${pageDims.length}` : ''}
        </span>
        <a
          href={downloadUrl}
          download
          className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-brand-600 hover:text-brand-600"
        >
          <Download className="h-3.5 w-3.5" />
          원문 PDF 다운로드
        </a>
      </div>

      {status === 'loading' && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          PDF를 불러오는 중...
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <AlertTriangle className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">PDF를 불러오지 못했습니다.</p>
          <a
            href={downloadUrl}
            download
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-brand-600 hover:text-brand-600"
          >
            <Download className="h-4 w-4" />
            {downloadFileName} 다운로드
          </a>
        </div>
      )}

      <div ref={containerRef} className={status === 'ready' ? 'block' : 'hidden'}>
        {pageDims.map((dim, idx) => (
          <PdfPage
            key={idx}
            pageNumber={idx + 1}
            dim={dim}
            containerWidth={containerWidth}
            getPage={getPage}
            onVisible={setCurrentPage}
            semaphore={semaphore}
          />
        ))}
      </div>
    </div>
  )
}

interface PdfPageProps {
  pageNumber: number
  dim: PageDim
  containerWidth: number
  getPage: (pageNumber: number) => Promise<PDFPageProxy>
  onVisible: (pageNumber: number) => void
  semaphore: RenderSemaphore
}

function PdfPage({ pageNumber, dim, containerWidth, getPage, onVisible, semaphore }: PdfPageProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  const scale = containerWidth > 0 ? containerWidth / dim.width : 0
  const height = scale > 0 ? dim.height * scale : 0

  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry.isIntersecting)
        if (entry.isIntersecting) onVisible(pageNumber)
      },
      { rootMargin: PRELOAD_ROOT_MARGIN },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [onVisible, pageNumber])

  useEffect(() => {
    if (!visible || scale <= 0) return
    let cancelled = false
    let renderTask: ReturnType<PDFPageProxy['render']> | null = null

    ;(async () => {
      await semaphore.acquire()
      if (cancelled) {
        semaphore.release()
        return
      }
      try {
        const page = await getPage(pageNumber)
        const viewport = page.getViewport({ scale })
        const canvas = canvasRef.current
        const layerEl = layerRef.current
        if (!canvas || !layerEl || cancelled) return

        const outputScale = window.devicePixelRatio || 1
        canvas.width = Math.floor(viewport.width * outputScale)
        canvas.height = Math.floor(viewport.height * outputScale)
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`

        const ctx = canvas.getContext('2d')
        if (!ctx) return
        renderTask = page.render({
          canvas,
          viewport,
          transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
        })
        await renderTask.promise
        if (cancelled) return

        // TextLayer(v6)가 round()로 폭·높이를 계산하려면 이 CSS 변수들이 필요하다.
        layerEl.style.setProperty('--scale-factor', String(scale))
        layerEl.style.setProperty('--total-scale-factor', String(scale))
        layerEl.style.setProperty('--scale-round-x', '1px')
        layerEl.style.setProperty('--scale-round-y', '1px')

        if (textLayerRef.current) {
          textLayerRef.current.replaceChildren()
          const textContent = await page.getTextContent()
          if (cancelled) return
          const textLayer = new TextLayer({
            textContentSource: textContent,
            container: textLayerRef.current,
            viewport,
          })
          await textLayer.render()
        }
      } catch (err) {
        if (!cancelled) console.error(`[PdfViewer] ${pageNumber}페이지 렌더 실패`, err)
      } finally {
        semaphore.release()
      }
    })()

    return () => {
      cancelled = true
      renderTask?.cancel()
    }
  }, [visible, scale, pageNumber, getPage, semaphore])

  // 화면 밖으로 벗어나면 canvas·텍스트 레이어를 비워 메모리를 회수한다.
  useEffect(() => {
    if (visible) return
    const canvas = canvasRef.current
    if (canvas) {
      canvas.width = 0
      canvas.height = 0
    }
    textLayerRef.current?.replaceChildren()
  }, [visible])

  return (
    <div ref={wrapperRef} style={{ height: height || undefined }} className="relative mx-auto mb-3">
      {height > 0 && (
        <div ref={layerRef} className="relative mx-auto bg-white shadow-sm" style={{ width: containerWidth, height }}>
          <canvas ref={canvasRef} className="block h-full w-full" />
          <div ref={textLayerRef} className="textLayer" />
        </div>
      )}
    </div>
  )
}
