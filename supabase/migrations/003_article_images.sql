-- Images stay private while a post is a draft. Public posts can expose only
-- images stored by their own author; clients obtain short-lived signed URLs.
begin;
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
