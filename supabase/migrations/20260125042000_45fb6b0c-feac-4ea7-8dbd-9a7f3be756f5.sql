CREATE OR REPLACE FUNCTION public.handle_profile_bootstrap_roles()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  invited boolean;
begin
  -- Always ensure student role exists
  insert into public.user_roles (user_id, role)
  values (new.user_id, 'student')
  on conflict do nothing;

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
$function$;