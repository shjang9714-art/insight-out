import type { Metadata } from 'next'
import McpTokenBoard from '@/components/admin/McpTokenBoard'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'

export const metadata: Metadata = {
  title: 'MCP 토큰 | 어드민 | Insight Out',
  description: '팀원별 MCP 토큰 발급·폐기. 각자의 Claude에서 인사이트 아웃에 직접 기록합니다.',
}

export default function AdminMcpPage() {
  return (
    <>
      <AdminPageHeader />
      <McpTokenBoard />
    </>
  )
}
