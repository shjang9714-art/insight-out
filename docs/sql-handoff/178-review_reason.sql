-- 178: 검토 대기 사유. nullable(발행 콘텐츠는 null). 후방호환.
ALTER TABLE contents ADD COLUMN IF NOT EXISTS review_reason text;
