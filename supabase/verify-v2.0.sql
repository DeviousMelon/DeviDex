-- DeviDex v2.0 verification. Read-only.
-- Every row should say ok = true.
select check_name, ok
from (values
  ('ribbon_plans table exists', to_regclass('public.ribbon_plans') is not null),
  ('RLS on ribbon_plans', (select relrowsecurity from pg_class where oid = 'public.ribbon_plans'::regclass)),
  ('visitors cannot read ribbon plans', not has_table_privilege('anon', 'public.ribbon_plans', 'SELECT')),
  ('bank_checklist table exists', to_regclass('public.bank_checklist') is not null),
  ('RLS on bank_checklist', (select relrowsecurity from pg_class where oid = 'public.bank_checklist'::regclass)),
  ('visitors cannot read checklists', not has_table_privilege('anon', 'public.bank_checklist', 'SELECT')),
  ('bank_last_chance table exists', to_regclass('public.bank_last_chance') is not null),
  ('RLS on bank_last_chance', (select relrowsecurity from pg_class where oid = 'public.bank_last_chance'::regclass)),
  ('visitors can read last-chance list', has_table_privilege('anon', 'public.bank_last_chance', 'SELECT')),
  ('visitors cannot edit last-chance list', not has_table_privilege('anon', 'public.bank_last_chance', 'INSERT')),
  ('RLS on bank_last_chance_done', (select relrowsecurity from pg_class where oid = 'public.bank_last_chance_done'::regclass)),
  ('starter last-chance entries exist', (select count(*) from public.bank_last_chance) >= 9),
  ('summary function exists', to_regprocedure('public.get_bank_prep_summary()') is not null),
  ('visitors cannot call summary', not has_function_privilege('anon', 'public.get_bank_prep_summary()', 'EXECUTE'))
) as checks(check_name, ok);

select
  (select count(*) from public.ribbon_plans) as ribbon_plans,
  (select count(*) from public.bank_checklist) as checklist_items,
  (select count(*) from public.bank_checklist where moved_at is null) as still_to_move,
  (select count(*) from public.bank_last_chance where is_published) as published_last_chance;
