import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SetPasswordForm } from '@/components/login/SetPasswordForm'

export const metadata: Metadata = {
  title: '비밀번호 설정 · Insight Out',
  description: 'Insight Out 계정의 로그인 비밀번호를 설정합니다.',
}

export default async function SetPasswordPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data, error } = await supabase
    .from('users')
    .select('has_password')
    .eq('id', user.id)
    .single()

  if (!error && data?.has_password === true) redirect('/dashboard')
  if (error && error.code !== '42703') {
    console.error('[set-password] 비밀번호 상태 조회 실패:', error.message)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">비밀번호 설정</h1>
        <p className="mt-2 mb-7 text-sm leading-6 text-slate-500">
          앞으로 이메일과 비밀번호로 로그인합니다. 사용할 비밀번호를 설정해 주세요.
        </p>
        <SetPasswordForm wasPasswordSet={false} />
      </section>
    </main>
  )
}
