'use client'

import { Check, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useAdminTheme } from '@/components/admin/AdminThemeScope'
import { ACCENT_PRESETS, FONT_FAMILY_OPTIONS, FONT_SCALE_OPTIONS } from '@/lib/admin/appearance'

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
      <h2 className="admin-section-title text-foreground">{title}</h2>
      {description && <p className="admin-section-desc mt-1 text-muted-foreground">{description}</p>}
      <div className="mt-4">{children}</div>
    </div>
  )
}

function SegmentButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'admin-btn-text flex h-11 items-center gap-1.5 rounded-md border px-4 transition-colors',
        active
          ? 'border-brand-600 bg-brand-600 text-white'
          : 'border-border bg-card text-foreground hover:bg-accent',
      )}
    >
      {active && <Check className="h-4 w-4 shrink-0" />}
      {children}
    </button>
  )
}

export default function AdminAppearanceSettings() {
  const { theme, toggle, appearance, setFontScale, setFontFamily, setAccent, reset } = useAdminTheme()

  return (
    <div className="space-y-6">
      <SectionCard title="테마" description="어드민 콘솔의 라이트/다크 모드를 선택합니다.">
        <div className="flex gap-2">
          <SegmentButton active={theme === 'light'} onClick={() => theme !== 'light' && toggle()}>
            <Sun className="h-4 w-4 shrink-0" />
            라이트
          </SegmentButton>
          <SegmentButton active={theme === 'dark'} onClick={() => theme !== 'dark' && toggle()}>
            <Moon className="h-4 w-4 shrink-0" />
            다크
          </SegmentButton>
        </div>
      </SectionCard>

      <SectionCard title="글자 크기" description="화면 전체 글자와 줄 간격의 밀도를 조정합니다.">
        <div className="flex gap-2">
          {FONT_SCALE_OPTIONS.map((opt) => (
            <SegmentButton
              key={opt.id}
              active={appearance.fontScale === opt.id}
              onClick={() => setFontScale(opt.id)}
            >
              {opt.label}
            </SegmentButton>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="폰트" description="어드민 화면에 사용할 글꼴을 선택합니다.">
        <div className="flex gap-2">
          {FONT_FAMILY_OPTIONS.map((opt) => (
            <SegmentButton
              key={opt.id}
              active={appearance.fontFamily === opt.id}
              onClick={() => setFontFamily(opt.id)}
            >
              {opt.label}
            </SegmentButton>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="강조색" description="버튼·배지·활성 표시 등에 쓰이는 강조색을 선택합니다.">
        <div className="flex flex-wrap gap-3">
          {ACCENT_PRESETS.map((preset) => {
            const active = appearance.accent === preset.id
            const swatchColor = theme === 'dark' ? preset.dark[600] : preset.light[600]
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => setAccent(preset.id)}
                className="flex flex-col items-center gap-1.5"
                title={preset.label}
              >
                <span
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-card transition-shadow',
                    active ? 'ring-foreground/60' : 'ring-transparent',
                  )}
                  style={{ backgroundColor: swatchColor }}
                >
                  {active && <Check className="h-4 w-4 shrink-0 text-white" />}
                </span>
                <span className="admin-caption text-muted-foreground">{preset.label}</span>
              </button>
            )
          })}
        </div>
      </SectionCard>

      <SectionCard title="미리보기" description="현재 설정이 실제 화면 요소에 어떻게 반영되는지 확인합니다.">
        <div className="space-y-4">
          <div>
            <p className="admin-page-title text-foreground">페이지 제목 예시</p>
            <p className="admin-body mt-1 text-muted-foreground">
              본문 텍스트 예시입니다. 글자 크기와 폰트 변경이 이 문단에도 적용됩니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button className="bg-brand-600 text-white hover:bg-brand-700">브랜드 버튼</Button>
            <Badge className="admin-badge bg-brand-600 text-white">배지 예시</Badge>
          </div>
        </div>
      </SectionCard>

      <div className="flex items-center justify-between rounded-xl border border-dashed border-border p-4">
        <p className="admin-caption text-muted-foreground">
          이 설정은 이 브라우저의 관리자 화면에만 적용됩니다. 방문자 화면과 다른 기기에는 영향이 없습니다.
        </p>
        <Button variant="outline" onClick={reset}>
          초기화
        </Button>
      </div>
    </div>
  )
}
