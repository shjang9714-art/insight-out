/**
 * 368 — 커버 이미지 클라이언트 자동 축소.
 * 업로드 직전, 2MB 상한을 넘는 이미지를 canvas로 리사이즈·재인코딩해 상한 이하로 줄인다.
 * 디코드 실패 등 어떤 이유로든 실패하면 원본 File을 그대로 반환한다(호출부가 기존 2MB 검증으로 처리).
 */

interface CompressImageOptions {
  /** 결과 목표 용량(바이트). 기본 2MB */
  maxBytes?: number
  /** 리사이즈 시 긴 변 상한(px). 기본 1600 */
  maxDimension?: number
  /** 품질 하한(0~1). 기본 0.4 */
  minQuality?: number
}

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024
const DEFAULT_MAX_DIMENSION = 1600
const DEFAULT_MIN_QUALITY = 0.4
const MIN_DIMENSION = 480
const QUALITY_STEPS = [0.85, 0.7, 0.55, 0.4]

export async function compressImageToLimit(file: File, opts: CompressImageOptions = {}): Promise<File> {
  if (!file.type.startsWith('image/')) return file

  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES
  if (file.size <= maxBytes) return file

  try {
    const source = await loadImageSource(file)
    const hasAlpha = file.type === 'image/png' || file.type === 'image/webp'
    const minQuality = opts.minQuality ?? DEFAULT_MIN_QUALITY
    let dimension = opts.maxDimension ?? DEFAULT_MAX_DIMENSION

    let best: Blob | null = null
    while (dimension >= MIN_DIMENSION) {
      const { width, height } = fitWithinMax(sourceWidth(source), sourceHeight(source), dimension)
      const canvas = drawToCanvas(source, width, height)

      let blob = await encodeWithQualitySteps(canvas, 'image/webp', minQuality, maxBytes)
      if ((!blob || blob.size > maxBytes) && hasAlpha) {
        // 투명 배경이 있는 원본을 jpeg으로 폴백할 때는 흰 배경으로 합성한다.
        const flat = flattenOnWhite(canvas)
        blob = await encodeWithQualitySteps(flat, 'image/jpeg', minQuality, maxBytes)
      } else if (!blob || blob.size > maxBytes) {
        blob = await encodeWithQualitySteps(canvas, 'image/jpeg', minQuality, maxBytes)
      }

      if (blob && (!best || blob.size < best.size)) best = blob
      if (blob && blob.size <= maxBytes) break
      dimension = Math.round(dimension * 0.75)
    }

    if ('close' in source) source.close()

    if (!best) return file
    const ext = best.type === 'image/webp' ? 'webp' : 'jpg'
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'cover'
    return new File([best], `${baseName}.${ext}`, { type: best.type })
  } catch {
    return file
  }
}

// ─── 내부 헬퍼 ──────────────────────────────────────────────────────────────

type ImageSource = ImageBitmap | HTMLImageElement

async function loadImageSource(file: File): Promise<ImageSource> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      // 일부 브라우저·포맷은 createImageBitmap이 실패할 수 있음 → <img> 폴백
    }
  }
  return loadImageElement(file)
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('이미지를 불러오지 못했습니다.'))
    }
    img.src = url
  })
}

function sourceWidth(source: ImageSource): number {
  return source instanceof HTMLImageElement ? source.naturalWidth : source.width
}

function sourceHeight(source: ImageSource): number {
  return source instanceof HTMLImageElement ? source.naturalHeight : source.height
}

function fitWithinMax(width: number, height: number, max: number): { width: number; height: number } {
  if (width <= max && height <= max) return { width, height }
  const scale = width >= height ? max / width : max / height
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

function drawToCanvas(source: ImageSource, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 컨텍스트를 생성하지 못했습니다.')
  ctx.drawImage(source as CanvasImageSource, 0, 0, width, height)
  return canvas
}

function flattenOnWhite(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const flat = document.createElement('canvas')
  flat.width = canvas.width
  flat.height = canvas.height
  const ctx = flat.getContext('2d')
  if (!ctx) return canvas
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, flat.width, flat.height)
  ctx.drawImage(canvas, 0, 0)
  return flat
}

function encodeToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), mime, quality))
}

async function encodeWithQualitySteps(
  canvas: HTMLCanvasElement,
  mime: string,
  minQuality: number,
  maxBytes: number,
): Promise<Blob | null> {
  const steps = Array.from(new Set([...QUALITY_STEPS, minQuality])).filter((q) => q >= minQuality)
  let smallest: Blob | null = null
  for (const quality of steps) {
    const blob = await encodeToBlob(canvas, mime, quality)
    if (!blob) continue
    if (!smallest || blob.size < smallest.size) smallest = blob
    if (blob.size <= maxBytes) return blob
  }
  return smallest
}
