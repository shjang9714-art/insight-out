import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

interface Props {
  children: string
  className?: string
}

export default function ReportMarkdown({ children, className }: Props) {
  return (
    <div
      className={cn(
        // 헤딩
        '[&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-foreground [&_h1]:mb-4 [&_h1]:mt-6',
        '[&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:mb-3 [&_h2]:mt-6 [&_h2]:border-b [&_h2]:border-border [&_h2]:pb-1.5',
        '[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mb-2 [&_h3]:mt-4',
        // 단락·텍스트
        '[&_p]:text-sm [&_p]:text-foreground/90 [&_p]:leading-relaxed [&_p]:mb-3',
        '[&_strong]:font-semibold [&_strong]:text-foreground',
        '[&_em]:italic [&_em]:text-foreground/80',
        // 목록
        '[&_ul]:mb-3 [&_ul]:pl-5 [&_ul]:list-disc [&_ul]:space-y-1',
        '[&_ol]:mb-3 [&_ol]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-1',
        '[&_li]:text-sm [&_li]:text-foreground/90 [&_li]:leading-relaxed',
        // 인용
        '[&_blockquote]:border-l-2 [&_blockquote]:border-brand-600/40 [&_blockquote]:pl-4 [&_blockquote]:py-1 [&_blockquote]:my-3',
        '[&_blockquote_p]:text-sm [&_blockquote_p]:text-muted-foreground [&_blockquote_p]:italic [&_blockquote_p]:mb-0',
        // 표 (GFM)
        '[&_table]:w-full [&_table]:text-sm [&_table]:border-collapse [&_table]:mb-4',
        '[&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:text-foreground',
        '[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_td]:text-foreground/90',
        '[&_tr:nth-child(even)_td]:bg-muted/40',
        // 코드
        '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_code]:font-mono',
        '[&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:overflow-x-auto [&_pre]:mb-3',
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
        // 수평선
        '[&_hr]:border-border [&_hr]:my-6',
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
