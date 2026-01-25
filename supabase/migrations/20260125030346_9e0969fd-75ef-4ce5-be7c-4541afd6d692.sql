-- Create simulations storage bucket (public read)
insert into storage.buckets (id, name, public)
values ('simulations', 'simulations', true)
on conflict (id) do nothing;

-- Storage policies for simulations bucket
-- Public read
create policy "Simulations: public read"
on storage.objects
for select
using (bucket_id = 'simulations');

-- Teacher/admin can upload to their own folder: <uid>/...
create policy "Simulations: teacher/admin upload own folder"
on storage.objects
for insert
with check (
  bucket_id = 'simulations'
  and (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'teacher'::app_role))
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Simulations: teacher/admin update own folder"
on storage.objects
for update
using (
  bucket_id = 'simulations'
  and (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'teacher'::app_role))
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'simulations'
  and (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'teacher'::app_role))
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Simulations: teacher/admin delete own folder"
on storage.objects
for delete
using (
  bucket_id = 'simulations'
  and (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'teacher'::app_role))
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- Enforce exam URL allowlist at the database level
create or replace function public.validate_exam_event_url()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  u text;
  host text;
  allowed boolean;
begin
  if (new.type = 'exam'::timeline_event_type) then
    u := coalesce(new.payload->>'url', '');

    if u = '' then
      raise exception 'Exam event requires payload.url';
    end if;

    if u !~* '^https?://' then
      raise exception 'Exam URL must start with http(s)://';
    end if;

    -- Extract host from URL (strip protocol, path, query, fragment)
    host := regexp_replace(u, '^https?://', '', 'i');
    host := regexp_replace(host, '/.*$', '');
    host := regexp_replace(host, '[:].*$', '');
    host := lower(host);

    allowed := host in ('testmoz.com', 'www.testmoz.com', 'rayvila.com', 'www.rayvila.com');

    if not allowed then
      raise exception 'Exam URL host % is not allowed', host;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_exam_event_url on public.timeline_events;
create trigger trg_validate_exam_event_url
before insert or update on public.timeline_events
for each row
execute function public.validate_exam_event_url();
