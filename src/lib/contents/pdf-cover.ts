'use client'

const COVER_WIDTH = 480

/** PDF 1페이지를 canvas 렌더 후 webp Blob으로 반환. 실패 시 null(호출부 graceful) */
export async function renderPdfCover(file: File): Promise<Blob | null> {
  try {
    const pdfjsLib = await import('pdfjs-dist')
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString()

    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    const page = await pdf.getPage(1)

    const baseViewport = page.getViewport({ scale: 1 })
    const scale = COVER_WIDTH / baseViewport.width
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    await page.render({ canvas, canvasContext: ctx, viewport }).promise

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/webp', 0.8)
    })
  } catch (err) {
    console.error('[pdf-cover] 표지 렌더 실패:', err)
    return null
  }
}
