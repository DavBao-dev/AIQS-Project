-- Full schema for a new Supabase project. Run in the SQL Editor.
-- Safe to run again: tables use "if not exists", policies and triggers are
-- dropped before being recreated. Existing projects can instead run the files
-- in supabase/migrations/ in order.
begin;

create table if not exists public.luma_user_data (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (key in ('saved','liked','notes','custom','rsvp','library')),
  value jsonb not null default '[]'::jsonb check (jsonb_typeof(value) = 'array'),
  updated_at timestamptz not null default now(),
  primary key (user_id,key)
);
alter table public.luma_user_data enable row level security;
revoke all on public.luma_user_data from anon;
grant select, insert, update, delete on public.luma_user_data to authenticated;
drop policy if exists "Read own library" on public.luma_user_data;
create policy "Read own library" on public.luma_user_data for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Insert own library" on public.luma_user_data;
create policy "Insert own library" on public.luma_user_data for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "Update own library" on public.luma_user_data;
create policy "Update own library" on public.luma_user_data for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Delete own library" on public.luma_user_data;
create policy "Delete own library" on public.luma_user_data for delete to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.luma_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 80),
  title text not null check (char_length(title) between 1 and 180),
  summary text not null check (char_length(summary) between 1 and 600),
  body text not null check (char_length(body) between 1 and 60000),
  type text not null check (type in ('Seminar','Video','News')),
  topic text not null check (topic in ('Trí tuệ nhân tạo','Kinh tế & Tài chính','Triết học & Xã hội','Toán học')),
  source_url text not null default '' check (source_url = '' or source_url ~ '^https?://[^[:space:]]+$'),
  tags text[] not null default '{}' check (cardinality(tags) <= 8),
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists luma_posts_feed on public.luma_posts (status,created_at desc);
create index if not exists luma_posts_author on public.luma_posts (author_id);
alter table public.luma_posts enable row level security;
grant select on public.luma_posts to anon;
grant select,insert,update,delete on public.luma_posts to authenticated;
drop policy if exists "Create own posts" on public.luma_posts;
create policy "Create own posts" on public.luma_posts for insert to authenticated
  with check ((select auth.uid()) = author_id);
drop policy if exists "Edit own posts" on public.luma_posts;
create policy "Edit own posts" on public.luma_posts for update to authenticated
  using ((select auth.uid()) = author_id) with check ((select auth.uid()) = author_id);
drop policy if exists "Delete own posts" on public.luma_posts;
create policy "Delete own posts" on public.luma_posts for delete to authenticated
  using ((select auth.uid()) = author_id);

create or replace function public.luma_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists luma_posts_updated_at on public.luma_posts;
create trigger luma_posts_updated_at before update on public.luma_posts
  for each row execute function public.luma_touch_updated_at();
drop trigger if exists luma_library_updated_at on public.luma_user_data;
create trigger luma_library_updated_at before update on public.luma_user_data
  for each row execute function public.luma_touch_updated_at();

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('post-images','post-images',false,2097152,array['image/webp','image/png','image/jpeg'])
on conflict (id) do nothing;
drop policy if exists "AIQS upload own article images" on storage.objects;
create policy "AIQS upload own article images" on storage.objects
for insert to authenticated with check (
  bucket_id='post-images' and (storage.foldername(name))[1]=(select auth.uid()::text)
);
drop policy if exists "AIQS delete own article images" on storage.objects;
create policy "AIQS delete own article images" on storage.objects
for delete to authenticated using (
  bucket_id='post-images' and (storage.foldername(name))[1]=(select auth.uid()::text)
);
commit;

-- Below: identical to migrations/004_moderation_and_trust.sql (keep both in sync).
-- Moderation and author trust. Safe to run more than once.
-- Posts from non-admins wait in 'pending' until an admin (luma_admins) publishes
-- them. Author names come from luma_profiles and dates are set by the database,
-- so clients cannot impersonate someone or pin a post to the top of the feed.
begin;

alter table public.luma_posts drop constraint if exists luma_posts_status_check;
alter table public.luma_posts add constraint luma_posts_status_check
  check (status in ('draft','pending','published'));

-- Admins are added by the project owner in the SQL Editor:
--   insert into public.luma_admins (user_id) values ('<auth user uuid>');
create table if not exists public.luma_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.luma_admins enable row level security;
revoke all on public.luma_admins from anon, authenticated;
grant select on public.luma_admins to authenticated;
drop policy if exists "Read own admin row" on public.luma_admins;
create policy "Read own admin row" on public.luma_admins for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.luma_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.luma_admins a where a.user_id = (select auth.uid()));
$$;
revoke all on function public.luma_is_admin() from public;
grant execute on function public.luma_is_admin() to anon, authenticated;

-- One public display name per account, unique regardless of case.
create table if not exists public.luma_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  updated_at timestamptz not null default now()
);
create unique index if not exists luma_profiles_name_unique
  on public.luma_profiles (lower(btrim(display_name)));
alter table public.luma_profiles enable row level security;
grant select on public.luma_profiles to anon, authenticated;
grant insert, update on public.luma_profiles to authenticated;
drop policy if exists "Read profiles" on public.luma_profiles;
create policy "Read profiles" on public.luma_profiles for select to anon, authenticated
  using (true);
drop policy if exists "Create own profile" on public.luma_profiles;
create policy "Create own profile" on public.luma_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "Update own profile" on public.luma_profiles;
create policy "Update own profile" on public.luma_profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Server-owned fields: author name, author, creation date and publish status.
create or replace function public.luma_posts_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  profile_name text;
  admin boolean := public.luma_is_admin();
begin
  if tg_op = 'UPDATE' then
    new.author_id = old.author_id;
    new.created_at = old.created_at;
  else
    new.created_at = now();
  end if;
  new.updated_at = now();

  select p.display_name into profile_name
    from public.luma_profiles p where p.user_id = new.author_id;
  if profile_name is null then
    raise exception 'Author profile is required before saving a post'
      using errcode = 'P0001';
  end if;
  new.author_name = profile_name;

  if not admin and new.status = 'published' then
    if tg_op = 'INSERT' or old.status <> 'published'
       or (new.title, new.summary, new.body, new.type, new.topic, new.source_url, new.tags)
          is distinct from
          (old.title, old.summary, old.body, old.type, old.topic, old.source_url, old.tags)
    then
      new.status = 'pending';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists luma_posts_guard on public.luma_posts;
create trigger luma_posts_guard before insert or update on public.luma_posts
  for each row execute function public.luma_posts_guard();

-- Keep the name on existing posts in step with the profile.
create or replace function public.luma_profiles_sync_posts()
returns trigger language plpgsql set search_path = '' as $$
begin
  update public.luma_posts set author_name = new.display_name
    where author_id = new.user_id and author_name is distinct from new.display_name;
  return new;
end;
$$;
drop trigger if exists luma_profiles_sync_posts on public.luma_profiles;
create trigger luma_profiles_sync_posts after update of display_name on public.luma_profiles
  for each row execute function public.luma_profiles_sync_posts();
drop trigger if exists luma_profiles_updated_at on public.luma_profiles;
create trigger luma_profiles_updated_at before update on public.luma_profiles
  for each row execute function public.luma_touch_updated_at();

-- Admins can read every post (to review pending ones) and change its status.
drop policy if exists "Read published or own posts" on public.luma_posts;
create policy "Read published or own posts" on public.luma_posts for select to anon, authenticated
  using (status = 'published' or (select auth.uid()) = author_id or (select public.luma_is_admin()));
drop policy if exists "Moderate posts" on public.luma_posts;
create policy "Moderate posts" on public.luma_posts for update to authenticated
  using ((select public.luma_is_admin())) with check ((select public.luma_is_admin()));

-- Admins also need the images of pending posts to review them.
drop policy if exists "AIQS read own or published article images" on storage.objects;
create policy "AIQS read own or published article images" on storage.objects
for select to anon, authenticated using (
  bucket_id = 'post-images' and (
    (storage.foldername(name))[1] = (select auth.uid()::text)
    or (select public.luma_is_admin())
    or exists (
      select 1 from public.luma_posts p
      where p.status = 'published'
        and p.author_id::text = (storage.foldername(storage.objects.name))[1]
        and position('supabase-image:' || storage.objects.name in p.body) > 0
    )
  )
);

-- Accounts created before this migration get a profile from their sign-up name.
-- Clashing names get a short suffix so the unique index holds.
insert into public.luma_profiles (user_id, display_name)
select u.id,
  left(coalesce(nullif(btrim(u.raw_user_meta_data->>'display_name'), ''), split_part(u.email, '@', 1)), 70)
    || case when count(*) over (
         partition by lower(btrim(coalesce(nullif(btrim(u.raw_user_meta_data->>'display_name'), ''), split_part(u.email, '@', 1))))
       ) > 1 then ' #' || left(u.id::text, 4) else '' end
from auth.users u
where not exists (select 1 from public.luma_profiles p where p.user_id = u.id)
on conflict do nothing;
commit;
