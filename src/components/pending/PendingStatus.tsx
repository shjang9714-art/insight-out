'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Clock, XCircle, LogOut } from 'lucide-react'

interface Props {
  status: 'pending' | 'rejected'
}

export default function PendingStatus({ status }: Props) {
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md text-center">
        <CardContent className="flex flex-col items-center gap-4 pt-8 pb-8">
          {status === 'pending' ? (
            <>
              <Clock className="h-12 w-12 text-muted-foreground" />
              <h1 className="text-xl font-bold text-foreground">가입 승인 대기 중입니다</h1>
              <p className="text-sm text-muted-foreground">
                관리자 승인 후 서비스를 이용하실 수 있습니다.<br />
                승인이 완료되면 새로고침 후 접속해 주세요.
              </p>
            </>
          ) : (
            <>
              <XCircle className="h-12 w-12 text-destructive" />
              <h1 className="text-xl font-bold text-foreground">가입이 거절되었습니다</h1>
              <p className="text-sm text-muted-foreground">
                관리자에 의해 가입 요청이 거절되었습니다.<br />
                문의 사항이 있으시면 관리자에게 연락해 주세요.
              </p>
            </>
          )}
          <Button variant="outline" onClick={handleLogout} className="mt-2">
            <LogOut className="mr-2 h-4 w-4" />
            로그아웃
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
