import type { Metadata } from 'next'
import { Cpu } from 'lucide-react'
import LlmManager from '@/components/admin/LlmManager'

export const metadata: Metadata = {
  title: 'LLM 관리 | Insight Out 어드민',
  description: 'LLM 연동 현황·사용량·라우팅 관리',
}

export default function LlmAdminPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Cpu className="h-5 w-5 text-brand-600" />
        <h1 className="text-xl font-semibold text-foreground">LLM 관리</h1>
      </div>
      <LlmManager />
    </div>
  )
}
