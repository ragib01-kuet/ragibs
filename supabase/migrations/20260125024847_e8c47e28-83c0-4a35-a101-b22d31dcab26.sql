-- 1) Common helper: updated_at trigger
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 2) Roles enum + user_roles table (roles stored separately)
do $$ begin
  create type public.app_role as enum ('admin', 'teacher', 'student');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

-- SECURITY DEFINER role check to avoid RLS recursion
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  );
$$;

-- 3) Profiles
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  bio text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger update_profiles_updated_at
before update on public.profiles
for each row execute function public.update_updated_at_column();

alter table public.profiles enable row level security;

-- 4) Teacher invites (admin invite-only)
create table if not exists public.teacher_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.teacher_invites enable row level security;

-- 5) Courses + Videos
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_courses_owner on public.courses(owner_id);

create trigger update_courses_updated_at
before update on public.courses
for each row execute function public.update_updated_at_column();

alter table public.courses enable row level security;

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  video_url text,
  duration_seconds int,
  lecture_sheet_url text,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_videos_course on public.videos(course_id);
create index if not exists idx_videos_owner on public.videos(owner_id);

create trigger update_videos_updated_at
before update on public.videos
for each row execute function public.update_updated_at_column();

alter table public.videos enable row level security;

-- 6) Timeline events + quiz tables + progress

do $$ begin
  create type public.timeline_event_type as enum ('quiz', 'simulation', 'exam');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.timeline_events (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  type public.timeline_event_type not null,
  at_seconds int not null,
  title text,
  required boolean not null default true,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_events_video on public.timeline_events(video_id);

create trigger update_timeline_events_updated_at
before update on public.timeline_events
for each row execute function public.update_updated_at_column();

alter table public.timeline_events enable row level security;

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.timeline_events(id) on delete cascade,
  question text not null,
  options text[] not null,
  correct_index int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger update_quizzes_updated_at
before update on public.quizzes
for each row execute function public.update_updated_at_column();

alter table public.quizzes enable row level security;

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.timeline_events(id) on delete cascade,
  selected_index int not null,
  is_correct boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_quiz_attempts_user_event on public.quiz_attempts(user_id, event_id);

alter table public.quiz_attempts enable row level security;

create table if not exists public.video_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  unlocked_until_seconds int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, video_id)
);

create trigger update_video_progress_updated_at
before update on public.video_progress
for each row execute function public.update_updated_at_column();

alter table public.video_progress enable row level security;

create table if not exists public.video_event_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.timeline_events(id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique (user_id, event_id)
);

alter table public.video_event_completions enable row level security;

create table if not exists public.exam_launches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.timeline_events(id) on delete cascade,
  launched_at timestamptz not null default now()
);

alter table public.exam_launches enable row level security;

-- 7) Bootstrap roles on profile creation (admin email + teacher invites)
create or replace function public.handle_profile_bootstrap_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  bootstrap_admin_email constant text := 'ragibabid.kuet@gmail.com';
  invited boolean;
begin
  -- Always ensure student role exists
  insert into public.user_roles (user_id, role)
  values (new.user_id, 'student')
  on conflict do nothing;

  -- Bootstrap admin by email (server-side)
  if lower(new.email) = lower(bootstrap_admin_email) then
    insert into public.user_roles (user_id, role)
    values (new.user_id, 'admin')
    on conflict do nothing;
  end if;

  -- Invite-only teacher role
  select exists(
    select 1 from public.teacher_invites ti where lower(ti.email) = lower(new.email)
  ) into invited;

  if invited then
    insert into public.user_roles (user_id, role)
    values (new.user_id, 'teacher')
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_bootstrap_roles on public.profiles;
create trigger profiles_bootstrap_roles
after insert on public.profiles
for each row execute function public.handle_profile_bootstrap_roles();

-- 8) RLS Policies

-- Profiles: user can read/update/insert own profile; admins can read all
create policy "Profiles: self read"
on public.profiles
for select
to authenticated
using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

create policy "Profiles: self insert"
on public.profiles
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Profiles: self update"
on public.profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- user_roles: only admins can view/manage roles (keeps roles private)
create policy "User roles: admins select"
on public.user_roles
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'));

create policy "User roles: admins insert"
on public.user_roles
for insert
to authenticated
with check (public.has_role(auth.uid(), 'admin'));

create policy "User roles: admins delete"
on public.user_roles
for delete
to authenticated
using (public.has_role(auth.uid(), 'admin'));

-- teacher_invites: admin manage
create policy "Teacher invites: admins select"
on public.teacher_invites
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'));

create policy "Teacher invites: admins insert"
on public.teacher_invites
for insert
to authenticated
with check (public.has_role(auth.uid(), 'admin'));

create policy "Teacher invites: admins delete"
on public.teacher_invites
for delete
to authenticated
using (public.has_role(auth.uid(), 'admin'));

-- Courses: published readable by anyone authenticated; owners/admin full control
create policy "Courses: read published"
on public.courses
for select
to authenticated
using (published = true or owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy "Courses: owner/admin insert"
on public.courses
for insert
to authenticated
with check (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy "Courses: owner/admin update"
on public.courses
for update
to authenticated
using (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
with check (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy "Courses: owner/admin delete"
on public.courses
for delete
to authenticated
using (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- Videos: published readable if course is published; owners/admin full control
create policy "Videos: read published"
on public.videos
for select
to authenticated
using (
  published = true
  or owner_id = auth.uid()
  or public.has_role(auth.uid(), 'admin')
);

create policy "Videos: owner/admin insert"
on public.videos
for insert
to authenticated
with check (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy "Videos: owner/admin update"
on public.videos
for update
to authenticated
using (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
with check (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy "Videos: owner/admin delete"
on public.videos
for delete
to authenticated
using (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- Timeline events: published videos readable by all authenticated, write by owner/admin
create policy "Events: read"
on public.timeline_events
for select
to authenticated
using (
  owner_id = auth.uid()
  or public.has_role(auth.uid(), 'admin')
  or exists (
    select 1
    from public.videos v
    where v.id = timeline_events.video_id
      and v.published = true
  )
);

create policy "Events: owner/admin insert"
on public.timeline_events
for insert
to authenticated
with check (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy "Events: owner/admin update"
on public.timeline_events
for update
to authenticated
using (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
with check (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy "Events: owner/admin delete"
on public.timeline_events
for delete
to authenticated
using (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- Quizzes: readable when event readable; writable by owner/admin
create policy "Quizzes: read"
on public.quizzes
for select
to authenticated
using (
  exists (
    select 1
    from public.timeline_events e
    where e.id = quizzes.event_id
      and (
        e.owner_id = auth.uid()
        or public.has_role(auth.uid(), 'admin')
        or exists (
          select 1 from public.videos v where v.id = e.video_id and v.published = true
        )
      )
  )
);

create policy "Quizzes: owner/admin write"
on public.quizzes
for all
to authenticated
using (
  exists (
    select 1 from public.timeline_events e
    where e.id = quizzes.event_id
      and (e.owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  )
)
with check (
  exists (
    select 1 from public.timeline_events e
    where e.id = quizzes.event_id
      and (e.owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  )
);

-- Quiz attempts: users can insert/select their own attempts
create policy "Quiz attempts: self select"
on public.quiz_attempts
for select
to authenticated
using (user_id = auth.uid());

create policy "Quiz attempts: self insert"
on public.quiz_attempts
for insert
to authenticated
with check (user_id = auth.uid());

-- Progress: users manage their own
create policy "Progress: self select"
on public.video_progress
for select
to authenticated
using (user_id = auth.uid());

create policy "Progress: self upsert"
on public.video_progress
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Progress: self update"
on public.video_progress
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Completions: users can insert/select their own
create policy "Completions: self select"
on public.video_event_completions
for select
to authenticated
using (user_id = auth.uid());

create policy "Completions: self insert"
on public.video_event_completions
for insert
to authenticated
with check (user_id = auth.uid());

-- Exam launches: users can insert/select their own
create policy "Exam launches: self select"
on public.exam_launches
for select
to authenticated
using (user_id = auth.uid());

create policy "Exam launches: self insert"
on public.exam_launches
for insert
to authenticated
with check (user_id = auth.uid());

-- 9) Storage bucket for avatars (public read)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Storage policies
create policy "Avatar images are publicly accessible"
on storage.objects
for select
using (bucket_id = 'avatars');

create policy "Users can upload their own avatar"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Users can update their own avatar"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Users can delete their own avatar"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);
