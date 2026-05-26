-- 固定姓名 + 固定密码登录模式使用。
-- 运行后，网站不再依赖 Supabase 邮箱登录，而是由前端固定登录界面控制入口。
-- 适合队内轻量协作；不要把 service_role 或管理员密钥放进网站。

drop policy if exists catalog_select_fixed_login on public.catalog_files;
create policy catalog_select_fixed_login on public.catalog_files
for select to anon, authenticated using (true);

drop policy if exists catalog_insert_fixed_login on public.catalog_files;
create policy catalog_insert_fixed_login on public.catalog_files
for insert to anon, authenticated with check (true);

drop policy if exists catalog_update_fixed_login on public.catalog_files;
create policy catalog_update_fixed_login on public.catalog_files
for update to anon, authenticated using (true) with check (true);

drop policy if exists posts_select_fixed_login on public.posts;
create policy posts_select_fixed_login on public.posts
for select to anon, authenticated using (true);

drop policy if exists posts_insert_fixed_login on public.posts;
create policy posts_insert_fixed_login on public.posts
for insert to anon, authenticated with check (true);

drop policy if exists post_files_select_fixed_login on public.post_files;
create policy post_files_select_fixed_login on public.post_files
for select to anon, authenticated using (true);

drop policy if exists post_files_insert_fixed_login on public.post_files;
create policy post_files_insert_fixed_login on public.post_files
for insert to anon, authenticated with check (true);

drop policy if exists team_resources_select_fixed_login on public.team_resources;
create policy team_resources_select_fixed_login on public.team_resources
for select to anon, authenticated using (true);

drop policy if exists team_resources_insert_fixed_login on public.team_resources;
create policy team_resources_insert_fixed_login on public.team_resources
for insert to anon, authenticated with check (true);

drop policy if exists resource_files_select_fixed_login on public.resource_files;
create policy resource_files_select_fixed_login on public.resource_files
for select to anon, authenticated using (true);

drop policy if exists resource_files_insert_fixed_login on public.resource_files;
create policy resource_files_insert_fixed_login on public.resource_files
for insert to anon, authenticated with check (true);

drop policy if exists storage_select_fixed_login on storage.objects;
create policy storage_select_fixed_login on storage.objects
for select to anon, authenticated
using (bucket_id = 'mathmodel-files');

drop policy if exists storage_insert_fixed_login on storage.objects;
create policy storage_insert_fixed_login on storage.objects
for insert to anon, authenticated
with check (bucket_id = 'mathmodel-files');

drop policy if exists storage_update_fixed_login on storage.objects;
create policy storage_update_fixed_login on storage.objects
for update to anon, authenticated
using (bucket_id = 'mathmodel-files')
with check (bucket_id = 'mathmodel-files');
