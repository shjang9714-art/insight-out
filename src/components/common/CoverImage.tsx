'use client'

import { useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react'

interface CoverImageProps extends Omit<ComponentPropsWithoutRef<'img'>, 'src' | 'alt' | 'onError'> {
  src: string | null | undefined
  alt: string
  fallback: ReactNode
  children?: ReactNode
}

export default function CoverImage({
  src,
  alt,
  fallback,
  children,
  ...imageProps
}: CoverImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const warnedSrcs = useRef(new Set<string>())

  if (!src || failedSrc === src) {
    return fallback
  }

  return (
    <>
      {/* next/image remotePatterns 미설정 — 기존 카드의 네이티브 이미지 렌더 유지 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        {...imageProps}
        src={src}
        alt={alt}
        onError={() => {
          if (!warnedSrcs.current.has(src)) {
            warnedSrcs.current.add(src)
            console.warn(`커버 이미지 로드에 실패해 기본 표지로 대체합니다: ${src}`)
          }
          setFailedSrc(src)
        }}
      />
      {children}
    </>
  )
}
