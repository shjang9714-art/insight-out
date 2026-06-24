-- 148: 인사이트 카드 에디토리얼 헤드라인(카드뉴스 큰 글자용). 후방호환 nullable.
ALTER TABLE insight_cards ADD COLUMN IF NOT EXISTS card_headline text;
