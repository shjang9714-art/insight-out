'use server'

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { requireAdminAction } from '@/lib/admin/require-admin-action'
import { completeAudit } from '@/lib/admin/audit'

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * 지시서 521 — 엔티티 병합. merge_entities RPC는 대상 엔티티(row)를 삭제하는
 * 파괴적 작업이라 브라우저 클라이언트에서 직접 호출하지 않고 이 서버 액션에서만
 * service role로 실행한다. DB 함수 자체의 is_admin() 검사는 service_role 호출을
 * 건너뛰므로(521 SQL 패치), 인가는 아래 requireAdminAction이 전담한다.
 */
export async function mergeEntities(sourceId: string, targetId: string) {
  const gate = await requireAdminAction({ action: 'entity.merge', capability: 'manage_sources' })
  if (!gate.ok) return { error: gate.error }

  if (!sourceId || !targetId || sourceId === targetId) {
    return { error: '병합할 두 엔티티를 선택해주세요.' }
  }

  const svc = serviceClient()
  const { error } = await svc.rpc('merge_entities', {
    p_source: sourceId,
    p_target: targetId,
  })

  await completeAudit(svc, gate.auditId, {
    targetType: 'entities',
    targetId: sourceId,
    payload: { targetEntityId: targetId },
    outcome: error ? 'failed' : 'ok',
    error: error?.message,
  })

  if (error) return { error: `병합 실패: ${error.message}` }

  revalidatePath('/admin/entities')
  return { error: null }
}
