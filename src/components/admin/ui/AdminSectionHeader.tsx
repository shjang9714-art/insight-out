import type { LucideIcon } from 'lucide-react'

interface Props {
  icon: LucideIcon
  title: string
  hint?: string
  action?: React.ReactNode
}

export default function AdminSectionHeader({ icon: Icon, title, hint, action }: Props) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <h2 className="admin-section-title text-foreground">{title}</h2>
      {hint && <span className="admin-section-desc text-muted-foreground">{hint}</span>}
      {action && <div className="ml-auto">{action}</div>}
    </div>
  )
}
