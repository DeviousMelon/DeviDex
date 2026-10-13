-- DeviDex v1.9 verification. Read-only.
-- Every row should say ok = true.
select check_name, ok
from (values
  ('forum tables exist', to_regclass('public.forum_posts') is not null and to_regclass('public.forum_comments') is not null
                          and to_regclass('public.forum_post_votes') is not null and to_regclass('public.forum_comment_votes') is not null),
  ('RLS on forum posts', (select relrowsecurity from pg_class where oid = 'public.forum_posts'::regclass)),
  ('RLS on forum comments', (select relrowsecurity from pg_class where oid = 'public.forum_comments'::regclass)),
  ('posts are function-only', not has_table_privilege('authenticated', 'public.forum_posts', 'SELECT, INSERT, UPDATE, DELETE')),
  ('votes are function-only', not has_table_privilege('authenticated', 'public.forum_post_votes', 'SELECT, INSERT, UPDATE, DELETE')),
  ('visitors can read the forums', has_function_privilege('anon', 'public.list_forum_posts(text, text, integer, integer)', 'EXECUTE')),
  ('visitors cannot post', not has_function_privilege('anon', 'public.create_forum_post(text, text, text, bigint)', 'EXECUTE')),
  ('visitors cannot vote', not has_function_privilege('anon', 'public.vote_forum_post(uuid, smallint)', 'EXECUTE')),
  ('internal row builder is private', not has_function_privilege('anon', 'public.forum_post_rows(uuid, text, text, integer, integer)', 'EXECUTE')),
  ('starter categories present', (select count(*) from public.forum_categories) >= 6),
  ('announcements are admin-only', coalesce((select admin_only_posts from public.forum_categories where slug = 'announcements'), false))
) as checks(check_name, ok);

select c.name, count(p.id) filter (where p.deleted_at is null) as posts
from public.forum_categories c
left join public.forum_posts p on p.category_id = c.id
group by c.id
order by c.sort_order;
