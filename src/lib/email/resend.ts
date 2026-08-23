import { Resend } from 'resend'

let client: Resend | undefined

function getClient(): Resend {
  if (!client) client = new Resend(process.env.RESEND_API_KEY ?? '')
  return client
}

export interface ResendAttachment {
  content: string  // base64
  name: string
}

export interface SendArgs {
  to: string | string[]
  subject: string
  html: string
  attachments?: ResendAttachment[]
}

/** 성공 시 messageId 반환, 실패 시 throw (Resend SDK는 { data, error } 형태로 응답). */
export async function sendResendEmail({ to, subject, html, attachments }: SendArgs): Promise<string> {
  const fromEmail = process.env.RESEND_FROM_EMAIL
  if (!fromEmail) {
    throw Object.assign(new Error('RESEND_FROM_EMAIL 미설정'), { name: 'missing_required_field' })
  }
  const { data, error } = await getClient().emails.send({
    from: fromEmail,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    attachments: attachments?.map((a) => ({ content: a.content, filename: a.name })),
  })
  if (error) {
    throw Object.assign(new Error(error.message), { name: error.name })
  }
  return data?.id ?? ''
}

export function normalizeResendError(err: unknown): { name?: string; message?: string } {
  const e = err as { name?: string; message?: string }
  return { name: e.name, message: e.message }
}
