-- DeviDex v2.1 + v2.1.1 verification. Read-only. Every row should say ok = true.

select check_name, ok from (
  select 1 as n, 'no RLS policy calls bare auth.uid() per row' as check_name,
    not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and (qual like '%auth.uid() =%' and qual not like '%SELECT auth.uid()%'
          or with_check like '%auth.uid() =%' and with_check not like '%SELECT auth.uid()%')
    ) as ok
  union all
  select 2, 'no admin FOR ALL policies left',
    not exists (select 1 from pg_policies where schemaname = 'public' and cmd = 'ALL' and qual = 'is_admin()')
  union all
  select 3, 'old "Admins can update profiles" policy gone',
    not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'Admins can update profiles')
  union all
  select 4, 'redundant collection_progress_user_idx dropped',
    to_regclass('public.collection_progress_user_idx') is null
  union all
  select 5, 'trade_list_form_shiny_idx exists',
    to_regclass('public.trade_list_form_shiny_idx') is not null
  union all
  select 6, 'forum_comments_parent_idx exists',
    to_regclass('public.forum_comments_parent_idx') is not null
  union all
  select 7, 'export v2/v3 dropped, v4 present',
    to_regprocedure('public.export_own_collection_v2()') is null
    and to_regprocedure('public.export_own_collection_v3()') is null
    and to_regprocedure('public.export_own_collection_v4()') is not null
  union all
  select 8, 'signed-in-only functions: anon blocked, authenticated allowed',
    bool_and(not has_function_privilege('anon', f::regprocedure, 'execute')
             and has_function_privilege('authenticated', f::regprocedure, 'execute'))
    from unnest(array[
      'public.activate_own_collection_view(uuid)',
      'public.delete_own_account()',
      'public.export_own_collection_v4()',
      'public.restore_own_collection(jsonb, jsonb, boolean)',
      'public.restore_own_collection_v2(jsonb, jsonb, boolean)',
      'public.restore_own_collection_v3(jsonb, jsonb, jsonb, boolean)',
      'public.restore_own_collection_v4(jsonb, jsonb, jsonb, jsonb, boolean)',
      'public.update_own_active_collection_definition(text, text, boolean, boolean, boolean, boolean, boolean, boolean)'
    ]) as f
  union all
  select 9, 'trigger functions not callable over the API',
    not has_function_privilege('authenticated', 'public.handle_new_user()', 'execute')
    and not has_function_privilege('anon', 'public.handle_new_user()', 'execute')
    and not has_function_privilege('authenticated', 'public.create_default_collection_view_for_profile()', 'execute')
    and not has_function_privilege('anon', 'public.create_default_collection_view_for_profile()', 'execute')
) checks
order by n;
