-- newsletter_recipients: resend_message_id → message_id
ALTER TABLE newsletter_recipients
  RENAME COLUMN resend_message_id TO message_id;
