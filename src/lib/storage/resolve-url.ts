export function resolveStorageUrl(value: string | null): string | null {
  if (!value) return null
  if (/^https?:\/\//.test(value)) return value

  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${value}`
}

export function isValidStorageUrlValue(value: string, bucket: string): boolean {
  if (/^https?:\/\//.test(value)) {
    try {
      const parsed = new URL(value)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
      return false
    }
  }

  const [path, query, ...extra] = value.split('?')
  if (extra.length > 0 || (query !== undefined && !/^v=\d+$/.test(query))) {
    return false
  }
  if (!path.startsWith(`${bucket}/`)) return false

  const objectPath = path.slice(bucket.length + 1)
  return objectPath.length > 0 && objectPath
    .split('/')
    .every((segment) => (
      segment !== '.' &&
      segment !== '..' &&
      /^[A-Za-z0-9._-]+$/.test(segment)
    ))
}
