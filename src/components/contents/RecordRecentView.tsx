'use client'

import { useEffect } from 'react'
import { addRecentView } from '@/lib/recent-views'

interface Props {
  id: string
  title: string
  category: string | null
}

export default function RecordRecentView({ id, title, category }: Props) {
  useEffect(() => {
    addRecentView({ id, title, category, viewedAt: Date.now() })
  }, [id, title, category])

  return null
}
