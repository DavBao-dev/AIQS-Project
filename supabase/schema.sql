-- Run once in your Supabase project's SQL Editor.
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
create policy "Read own library" on public.luma_user_data for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Insert own library" on public.luma_user_data for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Update own library" on public.luma_user_data for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
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
  status text not null default 'draft' check (status in ('draft','published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists luma_posts_feed on public.luma_posts (status,created_at desc);
create index if not exists luma_posts_author on public.luma_posts (author_id);
alter table public.luma_posts enable row level security;
grant select on public.luma_posts to anon;
grant select,insert,update,delete on public.luma_posts to authenticated;
create policy "Read published or own posts" on public.luma_posts for select to anon,authenticated
  using (status = 'published' or (select auth.uid()) = author_id);
create policy "Create own posts" on public.luma_posts for insert to authenticated
  with check ((select auth.uid()) = author_id);
create policy "Edit own posts" on public.luma_posts for update to authenticated
  using ((select auth.uid()) = author_id) with check ((select auth.uid()) = author_id);
create policy "Delete own posts" on public.luma_posts for delete to authenticated
  using ((select auth.uid()) = author_id);

create or replace function public.luma_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger luma_posts_updated_at before update on public.luma_posts
  for each row execute function public.luma_touch_updated_at();
create trigger luma_library_updated_at before update on public.luma_user_data
  for each row execute function public.luma_touch_updated_at();
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('post-images','post-images',false,2097152,array['image/webp','image/png','image/jpeg'])
on conflict (id) do nothing;

create policy "AIQS upload own article images" on storage.objects
for insert to authenticated with check (
  bucket_id='post-images' and (storage.foldername(name))[1]=(select auth.uid()::text)
);
create policy "AIQS read own or published article images" on storage.objects
for select to anon,authenticated using (
  bucket_id='post-images' and (
    (storage.foldername(name))[1]=(select auth.uid()::text)
    or exists (
      select 1 from public.luma_posts p
      where p.status='published'
        and p.author_id::text=(storage.foldername(storage.objects.name))[1]
        and position('supabase-image:'||storage.objects.name in p.body)>0
    )
  )
);
create policy "AIQS delete own article images" on storage.objects
for delete to authenticated using (
  bucket_id='post-images' and (storage.foldername(name))[1]=(select auth.uid()::text)
);
commit;
