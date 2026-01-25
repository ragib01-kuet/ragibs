-- Allow teachers/admins to view exam launch stats for their own content
-- Keep existing self-select policy intact.
create policy "Exam launches: teacher/admin select for owned content"
on public.exam_launches
for select
using (
  has_role(auth.uid(), 'admin'::app_role)
  or exists (
    select 1
    from public.timeline_events e
    join public.videos v on v.id = e.video_id
    where e.id = exam_launches.event_id
      and v.owner_id = auth.uid()
      and has_role(auth.uid(), 'teacher'::app_role)
  )
);
