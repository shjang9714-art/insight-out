/**
 * 클립보드 복사 — Clipboard API 우선, 실패 시 레거시 execCommand 폴백.
 * fetch 등 비동기 작업 이후 호출하면 transient user activation이 만료돼
 * NotAllowedError가 날 수 있으므로, 사용자 클릭에 직접 붙여 동기적으로 호출할 것.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to legacy fallback
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
