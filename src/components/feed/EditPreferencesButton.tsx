import { Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface EditPreferencesButtonProps {
  label: string
  onClick: () => void
}

export default function EditPreferencesButton({ label, onClick }: EditPreferencesButtonProps) {
  return (
    <Button variant="outline" size="sm" onClick={onClick}>
      <Settings2 data-icon="inline-start" />
      {label}
    </Button>
  )
}
