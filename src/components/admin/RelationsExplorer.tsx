import Link from 'next/link'
import type { EntityType } from '@/lib/types'
import { ENTITY_TYPE_LABEL } from '@/lib/types'
import { ENTITY_TYPE_CLS } from '@/lib/admin/palette'
import { cn } from '@/lib/utils'
import type { EntityBrief, ConnectedEntity, EvidenceContent } from '@/lib/admin/relations'

const ENTITY_TYPES: EntityType[] = ['company', 'tech', 'product', 'person', 'policy', 'industry']

interface Props {
  entities: EntityBrief[]
  query: string
  type: EntityType | null
  competitorOnly: boolean
  selectedEntityId: string | null
  relations: { focus: EntityBrief | null; connected: ConnectedEntity[]; contentSampled: number; truncated: boolean } | null
  withId: string | null
  evidence: EvidenceContent[]
}

function buildHref(base: { q?: string; type?: EntityType | null; competitor?: boolean; entity?: string | null; with?: string | null }): string {
  const params = new URLSearchParams()
  if (base.q) params.set('q', base.q)
  if (base.type) params.set('type', base.type)
  if (base.competitor) params.set('competitor', '1')
  if (base.entity) params.set('entity', base.entity)
  if (base.with) params.set('with', base.with)
  const qs = params.toString()
  return qs ? `/admin/relations?${qs}` : '/admin/relations'
}

function TypeBadge({ type }: { type: EntityType }) {
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', ENTITY_TYPE_CLS[type])}>
      {ENTITY_TYPE_LABEL[type]}
    </span>
  )
}

export default function RelationsExplorer({
  entities,
  query,
  type,
  competitorOnly,
  selectedEntityId,
  relations,
  withId,
  evidence,
}: Props) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* ① 엔티티 피커 */}
      <div className="rounded-xl border border-border bg-card p-4">
        <form method="get" action="/admin/relations" className="mb-3 flex gap-2">
          {type && <input type="hidden" name="type" value={type} />}
          {competitorOnly && <input type="hidden" name="competitor" value="1" />}
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="엔티티 검색..."
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
        </form>

        <div className="mb-3 flex flex-wrap gap-1.5">
          <Link
            href={buildHref({ q: query, competitor: competitorOnly })}
            prefetch={false}
            className={cn('rounded-full px-2.5 py-1 text-xs font-medium', !type ? 'bg-brand-600 text-white' : 'bg-muted/40 text-muted-foreground hover:bg-accent')}
          >
            전체
          </Link>
          {ENTITY_TYPES.map(t => (
            <Link
              key={t}
              href={buildHref({ q: query, type: t, competitor: competitorOnly })}
              prefetch={false}
              className={cn('rounded-full px-2.5 py-1 text-xs font-medium', type === t ? 'bg-brand-600 text-white' : 'bg-muted/40 text-muted-foreground hover:bg-accent')}
            >
              {ENTITY_TYPE_LABEL[t]}
            </Link>
          ))}
        </div>

        <Link
          href={buildHref({ q: query, type, competitor: !competitorOnly })}
          prefetch={false}
          className={cn(
            'mb-3 inline-block rounded-full px-2.5 py-1 text-xs font-medium',
            competitorOnly ? 'bg-brand-600 text-white' : 'bg-muted/40 text-muted-foreground hover:bg-accent'
          )}
        >
          경쟁사만
        </Link>

        {entities.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">일치하는 엔티티가 없습니다.</p>
        ) : (
          <ul className="max-h-[520px] space-y-1 overflow-y-auto">
            {entities.map(entity => (
              <li key={entity.id}>
                <Link
                  href={buildHref({ q: query, type, competitor: competitorOnly, entity: entity.id })}
                  prefetch={false}
                  className={cn(
                    'flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                    entity.id === selectedEntityId ? 'bg-brand-600/10 text-foreground' : 'hover:bg-accent text-foreground'
                  )}
                >
                  <span className="min-w-0 truncate">{entity.name}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <TypeBadge type={entity.type} />
                    <span className="admin-caption text-muted-foreground">{entity.mentionCount.toLocaleString()}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ② 연결 엔티티 */}
      <div className="rounded-xl border border-border bg-card p-4">
        {!selectedEntityId ? (
          <p className="py-8 text-center text-sm text-muted-foreground">왼쪽에서 엔티티를 선택하세요.</p>
        ) : !relations?.focus ? (
          <p className="py-8 text-center text-sm text-muted-foreground">엔티티를 찾을 수 없습니다.</p>
        ) : (
          <>
            <div className="mb-3 border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">{relations.focus.name}</h3>
                <TypeBadge type={relations.focus.type} />
                {relations.focus.isCompetitor && (
                  <span className="rounded-full bg-negative-soft px-2 py-0.5 text-[11px] font-medium text-negative">경쟁사</span>
                )}
              </div>
              <p className="mt-1 admin-caption text-muted-foreground">언급 {relations.focus.mentionCount.toLocaleString()}건</p>
              {relations.truncated && (
                <p className="mt-1 admin-caption text-muted-foreground">표본 상위 500 콘텐츠 기준</p>
              )}
            </div>

            {relations.connected.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">관계 데이터가 없습니다.</p>
            ) : (
              <ul className="max-h-[440px] space-y-1 overflow-y-auto">
                {relations.connected.map(({ entity, sharedCount }) => (
                  <li key={entity.id}>
                    <Link
                      href={buildHref({ q: query, type, competitor: competitorOnly, entity: selectedEntityId, with: entity.id })}
                      prefetch={false}
                      className={cn(
                        'flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                        entity.id === withId ? 'bg-brand-600/10 text-foreground' : 'hover:bg-accent text-foreground'
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate">{entity.name}</span>
                        <TypeBadge type={entity.type} />
                      </span>
                      <span className="shrink-0 admin-caption font-medium text-muted-foreground">공유 {sharedCount}건</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {/* ③ 근거 콘텐츠 */}
      <div className="rounded-xl border border-border bg-card p-4">
        {!withId ? (
          <p className="py-8 text-center text-sm text-muted-foreground">연결 엔티티를 선택하면 근거 콘텐츠가 표시됩니다.</p>
        ) : evidence.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">공유 콘텐츠가 없습니다.</p>
        ) : (
          <ul className="max-h-[520px] space-y-2 overflow-y-auto">
            {evidence.map(content => (
              <li key={content.id}>
                <Link
                  href={`/admin/contents/${content.id}`}
                  className="block rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent"
                >
                  <p className="truncate text-foreground">{content.title}</p>
                  <p className="mt-0.5 admin-caption text-muted-foreground">
                    {content.category ?? '분류 없음'}
                    {content.published_at && ` · ${new Date(content.published_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}`}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
