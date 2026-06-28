'use client'

import { useEffect } from 'react'

export default function MarkSeen() {
  useEffect(() => {
    fetch('/api/me/seen', { method: 'POST' }).catch(() => {})
  }, [])
  return null
}
