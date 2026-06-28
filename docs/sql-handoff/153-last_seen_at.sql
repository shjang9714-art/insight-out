-- 153: 재방문 델타용 마지막 방문 시각. 후방호환 nullable.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
