import { redirect } from 'next/navigation'

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function AdminRawPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams

  const parts: string[] = []
  const str = (key: string) => typeof params[key] === 'string' ? params[key] as string : undefined

  const category   = str('category')
  const status     = str('status')
  const from       = str('from')
  const bookmarked = str('bookmarked')
  const source     = str('source')
  // research 파라미터는 콘텐츠 관리 미지원 — 드롭

  if (category)           parts.push(`category=${encodeURIComponent(category)}`)
  if (status)             parts.push(`status=${encodeURIComponent(status)}`)
  if (from)               parts.push(`from=${encodeURIComponent(from)}`)
  if (bookmarked)         parts.push(`bookmarked=${bookmarked}`)
  if (source)             parts.push(`source=${encodeURIComponent(source)}`)

  redirect('/admin/contents' + (parts.length ? '?' + parts.join('&') : ''))
}
