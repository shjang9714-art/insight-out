import Link from 'next/link'
import { CATEGORIES } from './mock-data'

const CATEGORY_HREF: Record<string, string> = {
  youtube: '/dashboard/youtube',
}

const ITEM_CLASS =
  'flex flex-col items-center gap-2 rounded-2xl border border-gray-100 bg-white p-4 text-center transition-all hover:border-brand-200 hover:shadow-sm group'

interface Props {
  activeService?: string
}

export default function CategoryGrid({ activeService = 'all' }: Props) {
  const buildHref = (basePath: string) =>
    activeService !== 'all' ? `${basePath}?service=${activeService}` : basePath

  return (
    <div className="grid grid-cols-8 gap-3">
      {CATEGORIES.map((cat) => {
        const baseHref = CATEGORY_HREF[cat.id]
        const href = baseHref ? buildHref(baseHref) : undefined
        const inner = (
          <>
            <div className="relative">
              <span className="text-2xl">{cat.icon}</span>
              {cat.count > 0 && (
                <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                  {cat.count}
                </span>
              )}
            </div>
            <span className="text-xs font-medium leading-tight text-gray-700 group-hover:text-brand-600">
              {cat.label}
            </span>
          </>
        )

        return href ? (
          <Link key={cat.id} href={href} className={ITEM_CLASS}>
            {inner}
          </Link>
        ) : (
          <div key={cat.id} title="곧 제공 예정" className={`${ITEM_CLASS} cursor-default`}>
            {inner}
          </div>
        )
      })}
    </div>
  )
}
