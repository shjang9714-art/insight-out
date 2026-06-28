-- 155: 원문 링크 헬스. nullable=미점검. 후방호환.
ALTER TABLE contents ADD COLUMN IF NOT EXISTS link_ok boolean;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS link_checked_at timestamptz;
