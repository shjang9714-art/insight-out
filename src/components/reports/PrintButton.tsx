'use client'

import { Printer } from 'lucide-react'

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="print:hidden inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:border-brand-600/40 hover:text-brand-600 transition-colors"
    >
      <Printer className="h-3.5 w-3.5" />
      PDF로 내보내기
    </button>
  )
}
