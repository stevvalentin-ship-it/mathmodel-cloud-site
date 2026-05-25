-- 先让四个队友在网页上注册账号。
-- 然后把下面的邮箱改成真实邮箱，在 Supabase SQL Editor 运行。

insert into public.team_members (user_id, display_name, role, is_admin)
select id, '杨乐然', '队长', true
from auth.users
where email = '替换为杨乐然的邮箱@example.com'
on conflict (user_id) do update
set display_name = excluded.display_name,
    role = excluded.role,
    is_admin = excluded.is_admin;

insert into public.team_members (user_id, display_name, role, is_admin)
select id, '侯铖', '队友', false
from auth.users
where email = '替换为侯铖的邮箱@example.com'
on conflict (user_id) do update
set display_name = excluded.display_name,
    role = excluded.role,
    is_admin = excluded.is_admin;

insert into public.team_members (user_id, display_name, role, is_admin)
select id, '孙梓越', '队友', false
from auth.users
where email = '替换为孙梓越的邮箱@example.com'
on conflict (user_id) do update
set display_name = excluded.display_name,
    role = excluded.role,
    is_admin = excluded.is_admin;

insert into public.team_members (user_id, display_name, role, is_admin)
select id, '原翔豪', '队友', false
from auth.users
where email = '替换为原翔豪的邮箱@example.com'
on conflict (user_id) do update
set display_name = excluded.display_name,
    role = excluded.role,
    is_admin = excluded.is_admin;
