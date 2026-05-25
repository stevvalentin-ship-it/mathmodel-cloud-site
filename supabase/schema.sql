create extension if not exists pgcrypto;

create table if not exists public.team_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default '队友',
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.is_team_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where user_id = auth.uid()
  );
$$;

create or replace function public.is_team_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where user_id = auth.uid() and is_admin = true
  );
$$;

create table if not exists public.catalog_files (
  id uuid primary key default gen_random_uuid(),
  relative_path text not null unique,
  source text not null default 'problem',
  collection text,
  year int,
  problem_types text[] not null default '{}',
  title text not null,
  name text not null,
  folder text,
  ext text,
  kind text,
  size bigint,
  storage_path text not null,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references auth.users(id) on delete set null,
  author_name text not null,
  role text not null,
  year int,
  problem_type text,
  title text not null,
  body text not null,
  tags text,
  created_at timestamptz not null default now()
);

create table if not exists public.post_files (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  name text not null,
  relative_path text not null,
  storage_path text not null,
  size bigint,
  ext text,
  created_at timestamptz not null default now()
);

create table if not exists public.team_resources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  owner_name text not null,
  title text not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.resource_files (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.team_resources(id) on delete cascade,
  name text not null,
  relative_path text not null,
  storage_path text not null,
  size bigint,
  ext text,
  created_at timestamptz not null default now()
);

alter table public.team_members enable row level security;
alter table public.catalog_files enable row level security;
alter table public.posts enable row level security;
alter table public.post_files enable row level security;
alter table public.team_resources enable row level security;
alter table public.resource_files enable row level security;

drop policy if exists team_members_select on public.team_members;
create policy team_members_select on public.team_members
for select using (public.is_team_member());

drop policy if exists team_members_admin_all on public.team_members;
create policy team_members_admin_all on public.team_members
for all using (public.is_team_admin()) with check (public.is_team_admin());

drop policy if exists catalog_select on public.catalog_files;
create policy catalog_select on public.catalog_files
for select using (public.is_team_member());

drop policy if exists catalog_admin_insert on public.catalog_files;
create policy catalog_admin_insert on public.catalog_files
for insert with check (public.is_team_admin());

drop policy if exists catalog_admin_update on public.catalog_files;
create policy catalog_admin_update on public.catalog_files
for update using (public.is_team_admin()) with check (public.is_team_admin());

drop policy if exists catalog_admin_delete on public.catalog_files;
create policy catalog_admin_delete on public.catalog_files
for delete using (public.is_team_admin());

drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts
for select using (public.is_team_member());

drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts
for insert with check (public.is_team_member());

drop policy if exists posts_update_own on public.posts;
create policy posts_update_own on public.posts
for update using (author_id = auth.uid() or public.is_team_admin()) with check (author_id = auth.uid() or public.is_team_admin());

drop policy if exists posts_delete_own on public.posts;
create policy posts_delete_own on public.posts
for delete using (author_id = auth.uid() or public.is_team_admin());

drop policy if exists post_files_select on public.post_files;
create policy post_files_select on public.post_files
for select using (public.is_team_member());

drop policy if exists post_files_insert on public.post_files;
create policy post_files_insert on public.post_files
for insert with check (public.is_team_member());

drop policy if exists team_resources_select on public.team_resources;
create policy team_resources_select on public.team_resources
for select using (public.is_team_member());

drop policy if exists team_resources_insert on public.team_resources;
create policy team_resources_insert on public.team_resources
for insert with check (public.is_team_member());

drop policy if exists team_resources_update_own on public.team_resources;
create policy team_resources_update_own on public.team_resources
for update using (owner_id = auth.uid() or public.is_team_admin()) with check (owner_id = auth.uid() or public.is_team_admin());

drop policy if exists team_resources_delete_own on public.team_resources;
create policy team_resources_delete_own on public.team_resources
for delete using (owner_id = auth.uid() or public.is_team_admin());

drop policy if exists resource_files_select on public.resource_files;
create policy resource_files_select on public.resource_files
for select using (public.is_team_member());

drop policy if exists resource_files_insert on public.resource_files;
create policy resource_files_insert on public.resource_files
for insert with check (public.is_team_member());

insert into storage.buckets (id, name, public)
values ('mathmodel-files', 'mathmodel-files', false)
on conflict (id) do nothing;

drop policy if exists storage_select_team on storage.objects;
create policy storage_select_team on storage.objects
for select using (bucket_id = 'mathmodel-files' and public.is_team_member());

drop policy if exists storage_insert_team on storage.objects;
create policy storage_insert_team on storage.objects
for insert with check (bucket_id = 'mathmodel-files' and public.is_team_member());

drop policy if exists storage_update_team on storage.objects;
create policy storage_update_team on storage.objects
for update using (bucket_id = 'mathmodel-files' and public.is_team_member())
with check (bucket_id = 'mathmodel-files' and public.is_team_member());

drop policy if exists storage_delete_admin on storage.objects;
create policy storage_delete_admin on storage.objects
for delete using (bucket_id = 'mathmodel-files' and public.is_team_admin());
