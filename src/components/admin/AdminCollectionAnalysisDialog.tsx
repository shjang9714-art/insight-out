'use client'

import { BarChart3 } from 'lucide-react'
import { DashboardCharts, type ChartData } from '@/components/admin/DashboardCharts'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

interface Props {
  chartData: ChartData
}

export function AdminCollectionAnalysisDialog({ chartData }: Props) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <BarChart3 className="h-3.5 w-3.5" />
          수집 분석 보기
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[86vh] max-w-6xl p-6">
        <DialogHeader>
          <DialogTitle>수집 분석</DialogTitle>
          <DialogDescription>
            카테고리·상태·일별 추이·소스 기여도를 확인합니다.
          </DialogDescription>
        </DialogHeader>
        <DashboardCharts chartData={chartData} />
      </DialogContent>
    </Dialog>
  )
}
