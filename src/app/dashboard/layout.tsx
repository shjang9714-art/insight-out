import { Suspense } from 'react'
import DashboardShell from '@/components/dashboard/DashboardShell'

export default async function DashboardLayout({
  children,
  modal,
}: {
  children: React.ReactNode
  modal: React.ReactNode
}) {
  return (
    <>
      <Suspense fallback={<div className="min-h-screen bg-background" />}>
        <DashboardShell>{children}</DashboardShell>
      </Suspense>
      {modal}
    </>
  )
}
