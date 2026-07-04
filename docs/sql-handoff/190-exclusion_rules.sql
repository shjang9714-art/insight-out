-- 190: 제외 규칙(반복 방지). 도메인/URL/제목 패턴을 자동 보류(hold) 또는 미적재(reject).
create table if not exists exclusion_rules (
  id          uuid primary key default gen_random_uuid(),
  rule_type   text not null,                          -- domain | url_pattern | title_pattern
  value       text not null,                          -- 예: "example.com", "/promo/", "쿠폰"
  action      text not null default 'reject',         -- reject(미적재) | hold(검토 대기)
  is_active   boolean not null default true,
  note        text,
  hit_count   integer not null default 0,             -- 매칭 누적(후속 갱신)
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_exclusion_rules_active on exclusion_rules (is_active, rule_type);
create unique index if not exists uq_exclusion_rules_type_value on exclusion_rules (rule_type, lower(value));
