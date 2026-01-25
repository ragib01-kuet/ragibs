-- Public browsing: allow anonymous SELECT on published courses/videos/events/quizzes
-- NOTE: keep writes restricted to authenticated.

-- 0) Ensure profile bootstrap trigger exists (it was expected but may not exist)
do $$ begin
  if not exists (
    select 1 from pg_trigger where tgname = 'profiles_bootstrap_roles'
  ) then
    create trigger profiles_bootstrap_roles
    after insert on public.profiles
    for each row execute function public.handle_profile_bootstrap_roles();
  end if;
end $$;

-- 1) Provide a safe RPC for the current user to read their own roles
create or replace function public.get_my_roles()
returns setof public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select ur.role
  from public.user_roles ur
  where ur.user_id = auth.uid();
$$;

grant execute on function public.get_my_roles() to anon, authenticated;

-- 2) Update SELECT policies to include anon on published content

drop policy if exists "Courses: read published" on public.courses;
create policy "Courses: read published"
on public.courses
for select
to anon, authenticated
using (published = true or owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'::public.app_role));

-- videos
alter table public.videos drop constraint if exists videos_course_published_check;

drop policy if exists "Videos: read published" on public.videos;
create policy "Videos: read published"
on public.videos
for select
to anon, authenticated
using (
  published = true
  or owner_id = auth.uid()
  or public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- events

drop policy if exists "Events: read" on public.timeline_events;
create policy "Events: read"
on public.timeline_events
for select
to anon, authenticated
using (
  owner_id = auth.uid()
  or public.has_role(auth.uid(), 'admin'::public.app_role)
  or exists (
    select 1
    from public.videos v
    where v.id = timeline_events.video_id
      and v.published = true
  )
);

-- quizzes

drop policy if exists "Quizzes: read" on public.quizzes;
create policy "Quizzes: read"
on public.quizzes
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.timeline_events e
    where e.id = quizzes.event_id
      and (
        e.owner_id = auth.uid()
        or public.has_role(auth.uid(), 'admin'::public.app_role)
        or exists (
          select 1 from public.videos v where v.id = e.video_id and v.published = true
        )
      )
  )
);
