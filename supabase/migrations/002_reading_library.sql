-- Only needed for projects that already ran the previous schema.sql.
begin;
alter table public.luma_user_data drop constraint if exists luma_user_data_key_check;
alter table public.luma_user_data add constraint luma_user_data_key_check
  check (key in ('saved','liked','notes','custom','rsvp','library'));
commit;
