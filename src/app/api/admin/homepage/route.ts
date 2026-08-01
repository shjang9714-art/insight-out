import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextResponse } from 'next/server'
import { HOME_SECTION_REGISTRY } from '@/lib/home/sections'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'


interface SectionRow {
  key: string
  label: string
  description: string
  enabled: boolean
  sort_order: number
}

/**
 * GET /api/admin/homepage
 * 레지스트리 + homepage_sections 병합 반환. 테이블 없으면(42P01) 레지스트리 기본값.
 */
export async function GET() {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  try {
    const admin = gate.admin
    const { data } = await admin
      .from('homepage_sections')
      .select('section_key, enabled, sort_order')
      .order('sort_order')

    const savedMap = new Map((data ?? []).map((row) => [row.section_key as string, row]))

    const sections: SectionRow[] = HOME_SECTION_REGISTRY.map((def, index) => {
      const saved = savedMap.get(def.key)
      return {
        key: def.key,
        label: def.label,
        description: def.description,
        enabled: saved?.enabled ?? true,
        sort_order: saved?.sort_order ?? (index + 1) * 10,
      }
    }).sort((a, b) => a.sort_order - b.sort_order)

    return NextResponse.json({ sections })
  } catch (err) {
    console.error('[/api/admin/homepage] GET 오류:', err)
    const sections: SectionRow[] = HOME_SECTION_REGISTRY.map((def, index) => ({
      key: def.key,
      label: def.label,
      description: def.description,
      enabled: true,
      sort_order: (index + 1) * 10,
    }))
    return NextResponse.json({ sections })
  }
}

/**
 * PUT /api/admin/homepage
 * body: { sections: { key, enabled, sort_order }[] }
 * 레지스트리 key만 허용, 최소 1개 노출 강제.
 */
export async function PUT(req: Request) {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  try {
    const body = await req.json() as {
      sections?: { key: string; enabled: boolean; sort_order: number }[]
    }

    if (!body.sections || !Array.isArray(body.sections) || body.sections.length === 0) {
      return NextResponse.json({ error: 'sections 필드가 필요합니다.' }, { status: 400 })
    }

    const registryKeys = new Set(HOME_SECTION_REGISTRY.map((s) => s.key))
    const invalid = body.sections.find((s) => !registryKeys.has(s.key))
    if (invalid) {
      return NextResponse.json({ error: `알 수 없는 섹션입니다: ${invalid.key}` }, { status: 400 })
    }

    if (!body.sections.some((s) => s.enabled)) {
      return NextResponse.json({ error: '최소 1개 섹션은 노출되어야 합니다.' }, { status: 400 })
    }

    const admin = gate.admin
    const { error } = await admin
      .from('homepage_sections')
      .upsert(
        body.sections.map((s) => ({
          section_key: s.key,
          enabled: s.enabled,
          sort_order: s.sort_order,
        })),
        { onConflict: 'section_key' }
      )

    if (error) {
      console.error('[/api/admin/homepage] PUT 오류:', error.message)
      return NextResponse.json({ error: '설정 저장에 실패했습니다.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/admin/homepage] PUT 오류:', err)
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
