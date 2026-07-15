import type { Metadata } from 'next'
import { FileArchive } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'
import AdminEmptyState from '@/components/admin/ui/AdminEmptyState'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'
import CompanyDocumentsCollector, {
  type DartCompanyOption,
} from '@/components/admin/CompanyDocumentsCollector'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '기업자료 수집 | 어드민 | Insight Out',
  description: '기업별 DART 공시를 수집하고 최근 적재 상태를 확인합니다.',
}

interface MappingRow {
  corp_code: string
  corp_name: string
  entities: { canonical_name: string } | { canonical_name: string }[] | null
}

interface DocumentRow {
  content_id: string
  doc_type: string
  published_on: string | null
  review_status: string
  ingest_status: string
  dart_rcept_no: string | null
  contents: { title: string; original_url: string | null; status: string } | { title: string; original_url: string | null; status: string }[] | null
  entities: { canonical_name: string } | { canonical_name: string }[] | null
}

function firstRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value
}

function defaultSince(): string {
  const date = new Date()
  date.setDate(date.getDate() - 90)
  return date.toISOString().slice(0, 10)
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00`))
}

export default async function CompanyDocumentsAdminPage() {
  const supabase = await createClient()
  const mappingResult = await supabase
    .from('entity_dart_map')
    .select('corp_code, corp_name, entities(canonical_name)')
    .order('corp_name')

  const schemaReady = !mappingResult.error
    || (mappingResult.error.code !== '42P01' && mappingResult.error.code !== 'PGRST205')
  const companies: DartCompanyOption[] = schemaReady
    ? ((mappingResult.data ?? []) as unknown as MappingRow[]).map((row) => ({
        corpCode: row.corp_code,
        corpName: row.corp_name,
        entityName: firstRelation(row.entities)?.canonical_name ?? row.corp_name,
      }))
    : []

  const documentsResult = schemaReady
    ? await supabase
        .from('company_documents')
        .select('content_id, doc_type, published_on, review_status, ingest_status, dart_rcept_no, contents!inner(title, original_url, status), entities(canonical_name)')
        .order('published_on', { ascending: false })
        .limit(50)
    : { data: null, error: mappingResult.error }
  const documents = (documentsResult.data ?? []) as unknown as DocumentRow[]
  const queryError = mappingResult.error ?? documentsResult.error

  return (
    <div className="space-y-8">
      <AdminPageHeader />

      {!schemaReady ? (
        <AdminErrorBox>
          355-A 기업자료 SQL이 아직 적용되지 않았습니다. SQL 핸드오프를 적용하면 수집 기능이 활성화됩니다.
        </AdminErrorBox>
      ) : queryError ? (
        <AdminErrorBox>기업자료 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</AdminErrorBox>
      ) : null}

      <CompanyDocumentsCollector
        companies={companies}
        defaultSince={defaultSince()}
        schemaReady={schemaReady && !queryError}
      />

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">최근 적재 문서</h2>
          <p className="mt-1 text-xs text-muted-foreground">최신 50건 · 상세 편집은 355-C에서 제공합니다.</p>
        </div>

        {documents.length === 0 ? (
          <AdminEmptyState
            icon={FileArchive}
            message={schemaReady ? '아직 적재된 기업자료가 없습니다.' : '기업자료 테이블이 준비되지 않았습니다.'}
            className="rounded-xl border border-border bg-card p-10"
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="min-w-[760px] w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted text-left text-xs font-semibold text-muted-foreground">
                  <th className="px-4 py-3">기업</th>
                  <th className="px-4 py-3">문서명</th>
                  <th className="px-4 py-3">유형</th>
                  <th className="px-4 py-3">발행일</th>
                  <th className="px-4 py-3">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {documents.map((document) => {
                  const content = firstRelation(document.contents)
                  const entity = firstRelation(document.entities)
                  return (
                    <tr key={document.content_id} className="hover:bg-accent/50">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                        {entity?.canonical_name ?? '미매칭'}
                      </td>
                      <td className="max-w-md px-4 py-3">
                        {content?.original_url ? (
                          <a
                            href={content.original_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="line-clamp-2 text-foreground hover:text-brand-600 hover:underline"
                          >
                            {content.title}
                          </a>
                        ) : (content?.title ?? '제목 없음')}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{document.doc_type}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDate(document.published_on)}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className={content?.status === 'published'
                          ? 'rounded-full bg-positive-soft px-2 py-0.5 text-xs font-medium text-positive'
                          : 'rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'}>
                          {content?.status === 'published' ? '자동공개' : document.review_status === '검토대기' ? '검토대기' : '보류'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
