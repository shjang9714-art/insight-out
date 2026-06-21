import { BrevoClient } from '@getbrevo/brevo'

const client = new BrevoClient({ apiKey: process.env.BREVO_API_KEY ?? '' })

export interface BrevoAttachment {
  content: string  // base64
  name: string
}

export interface SendArgs {
  to: string | string[]
  subject: string
  html: string
  attachments?: BrevoAttachment[]
}

/** 성공 시 messageId 반환, 실패 시 throw (Brevo SDK는 비2xx에서 reject). */
export async function sendBrevoEmail({ to, subject, html, attachments }: SendArgs): Promise<string> {
  const fromEmail = process.env.BREVO_FROM_EMAIL
  const fromName = process.env.BREVO_FROM_NAME ?? 'Insight Out'
  if (!fromEmail) {
    throw Object.assign(new Error('BREVO_FROM_EMAIL 미설정'), { name: 'missing_required_field' })
  }
  const toList = (Array.isArray(to) ? to : [to]).map((email) => ({ email }))
  const res = await client.transactionalEmails.sendTransacEmail({
    sender: { email: fromEmail, name: fromName },
    to: toList,
    subject,
    htmlContent: html,
    attachment: attachments?.map((a) => ({ content: a.content, name: a.name })),
  })
  return res.messageId ?? ''
}

export function normalizeBrevoError(err: unknown): { name?: string; message?: string } {
  const e = err as { name?: string; body?: { code?: string; message?: string }; message?: string; response?: { body?: { message?: string } } }
  return { name: e.name ?? e.body?.code, message: e.body?.message ?? e.response?.body?.message ?? e.message }
}
