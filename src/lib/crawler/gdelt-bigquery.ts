import { BigQuery } from '@google-cloud/bigquery'

export interface GdeltMonthWindow { from: string; to: string; keywordTerms: string[]; koreanDomains?: string[]; maxBytes?: number }
export interface GdeltDiscovery { url: string; date: string; domain: string }

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024 * 1024
interface QueryJobLike { getQueryResults: () => Promise<[Array<{ DocumentIdentifier?: string; DATE?: string; SourceCommonName?: string }>]>, metadata?: { statistics?: unknown } }

function clientFromEnv(): BigQuery {
  const raw = process.env.GCP_SA_KEY
  if (!raw) throw new Error('GCP_SA_KEY가 설정되지 않았습니다.')
  const credentials = JSON.parse(raw) as { project_id?: string; client_email: string; private_key: string }
  return new BigQuery({ projectId: process.env.GCP_PROJECT_ID ?? credentials.project_id, credentials })
}

export async function queryGdeltMonth(window: GdeltMonthWindow): Promise<GdeltDiscovery[]> {
  const client = clientFromEnv()
  const terms = window.keywordTerms.filter(Boolean).slice(0, 80)
  if (!terms.length) return []
  const domains = (window.koreanDomains ?? []).filter(Boolean)
  const query = `SELECT DocumentIdentifier, DATE, SourceCommonName
    FROM \`gdelt-bq.gdeltv2.gkg_partitioned\`
    WHERE _PARTITIONTIME >= @from AND _PARTITIONTIME < @to
      AND (REGEXP_CONTAINS(LOWER(SourceCommonName), r'\\.kr$') OR SourceCommonName IN UNNEST(@domains))
      AND EXISTS (SELECT 1 FROM UNNEST(@terms) term WHERE STRPOS(LOWER(CONCAT(IFNULL(V2Organizations, ''), ' ', IFNULL(V2Persons, ''), ' ', IFNULL(AllNames, ''))), LOWER(term)) > 0)
      AND DocumentIdentifier IS NOT NULL
    LIMIT 10000`
  const response = await client.createQueryJob({
    query, params: { from: window.from, to: window.to, terms, domains },
    maximumBytesBilled: String(window.maxBytes ?? DEFAULT_MAX_BYTES),
    useLegacySql: false,
  }) as unknown as [QueryJobLike]
  const [job] = response
  const [rows] = await job.getQueryResults()
  const statistics = job.metadata?.statistics as { totalBytesProcessed?: string } | undefined
  console.log('[GDELT BigQuery] 월 조회 스캔량:', statistics?.totalBytesProcessed ?? '알 수 없음')
  return (rows as Array<{ DocumentIdentifier?: string; DATE?: string; SourceCommonName?: string }>).filter(row => row.DocumentIdentifier).map(row => ({
    url: row.DocumentIdentifier as string,
    date: row.DATE ?? window.from,
    domain: row.SourceCommonName ?? 'GDELT',
  }))
}

export function hasGdeltCredentials(): boolean { return Boolean(process.env.GCP_SA_KEY) }
