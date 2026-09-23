-- Prevent chapter/story publication from exhausting the client-facing
-- notification write quota. Nested writes originate from trusted database
-- triggers; direct API writes still pass through the normal limiter.
create or replace function private.rate_limit_table_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_limit integer := 300;
  v_window interval := interval '5 minutes';
begin
  if tg_table_name = 'notifications' and pg_trigger_depth() > 1 then
    return null;
  end if;

  if tg_table_name = 'inbox' then
    v_limit := 10;
    v_window := interval '1 hour';
  elsif tg_table_name = 'views' then
    v_limit := 120;
    v_window := interval '1 hour';
  end if;

  perform private.enforce_write_rate_limit(tg_table_name, v_limit, v_window);
  return null;
end
$function$;
