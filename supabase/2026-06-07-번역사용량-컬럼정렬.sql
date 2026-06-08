-- translation_usage 컬럼명 정본(chars) 정렬: 일부 DB가 char_count 로 생성됨
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'translation_usage'
      and column_name = 'char_count'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'translation_usage'
      and column_name = 'chars'
  ) then
    alter table public.translation_usage rename column char_count to chars;
  end if;
end $$;

-- 정본 RPC 재적용(chars 사용 보장; char_count 기반 RPC 차단)
create or replace function public.increment_translation_usage(
  p_provider text,
  p_period text,
  p_chars bigint
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.translation_usage (period, provider, chars, updated_at)
  values (p_period, p_provider, greatest(p_chars, 0), now())
  on conflict (period, provider) do update
  set chars = public.translation_usage.chars + excluded.chars,
      updated_at = now();
$$;

revoke all on function public.increment_translation_usage(text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.increment_translation_usage(text, text, bigint)
  to service_role;
