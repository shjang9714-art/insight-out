import type { EntityType } from '@/lib/types'

export const ENTITY_TYPE_STYLE: Record<EntityType, string> = {
  company:  'border-brand-200 bg-brand-50 text-brand-700',
  tech:     'border-blue-200 bg-blue-50 text-blue-700',
  product:  'border-violet-200 bg-violet-50 text-violet-700',
  person:   'border-emerald-200 bg-emerald-50 text-emerald-700',
  policy:   'border-amber-200 bg-amber-50 text-amber-700',
  industry: 'border-border bg-muted text-muted-foreground',
  org:      'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300',
}

export function entityStyle(type: EntityType, isCompetitor: boolean): string {
  if (type === 'company' && isCompetitor) return 'border-red-200 bg-red-50 text-red-700'
  return ENTITY_TYPE_STYLE[type]
}
