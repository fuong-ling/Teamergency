-- Remove only the broken demo Software Engineering class identified below.
--
-- This script is intentionally not executed by Codex. Run it manually only
-- after reviewing the target row and the safety checks.

begin;

do $$
declare
  target_class_id uuid := 'ddcb4aa2-bf81-461b-99cc-cab8298b2bfd'::uuid;
  target_request_ids uuid[] := '{}'::uuid[];
  target_connection_ids uuid[] := '{}'::uuid[];
  has_non_demo boolean;
  removed_count integer;
begin
  -- Re-check the complete identity so no other 88889999 class can match.
  if not exists (
    select 1
    from public.classes c
    where c.id = target_class_id
      and c.is_demo = true
      and c.university = 'University of Technology Ho Chi Minh City'
      and c.school = 'SSET'
      and c.major = 'Software Engineering'
      and c.course = 'Software Engineering'
      and c.course_name = 'Software Engineering'
      and c.course_code = 'COSC2440'
      and c.class_session = 'Session 01'
      and c.session_code = '01'
      and c.lecturer_name = 'Sarah Nguyen'
      and c.lecturer_id = 'v345678'
      and c.join_code = '88889999'
      and c.demo_class_code is null
  ) then
    raise exception
      'Expected broken demo class ddcb4aa2-bf81-461b-99cc-cab8298b2bfd was not found with all expected attributes; nothing was deleted.';
  end if;

  -- Collect only requests owned by demo profiles and linked to this class.
  select coalesce(array_agg(tr.id), '{}'::uuid[])
  into target_request_ids
  from public.team_requests tr
  join public.profiles p on p.id = tr.profile_id
  where tr.class_id = target_class_id
    and p.is_demo = true;

  if exists (
    select 1
    from public.class_members cm
    join public.profiles p on p.id = cm.profile_id
    where cm.class_id = target_class_id
      and coalesce(p.is_demo, false) = false
  ) then
    raise exception
      'The target class has a non-demo class member; aborting without deleting data.';
  end if;

  if exists (
    select 1
    from public.team_requests tr
    join public.profiles p on p.id = tr.profile_id
    where tr.class_id = target_class_id
      and coalesce(p.is_demo, false) = false
  ) then
    raise exception
      'The target class has a non-demo team request; aborting without deleting data.';
  end if;

  select coalesce(array_agg(distinct c.id), '{}'::uuid[])
  into target_connection_ids
  from public.connections c
  where c.sender_team_request_id = any(target_request_ids)
     or c.receiver_team_request_id = any(target_request_ids);

  if exists (
    select 1
    from public.connections c
    join public.profiles sender on sender.id = c.sender_profile_id
    join public.profiles receiver on receiver.id = c.receiver_profile_id
    where c.id = any(target_connection_ids)
      and (
        coalesce(sender.is_demo, false) = false
        or coalesce(receiver.is_demo, false) = false
      )
  ) then
    raise exception
      'The target class has a connection involving a non-demo profile; aborting without deleting data.';
  end if;

  if to_regclass('public.team_members') is not null then
    execute $sql$
      select exists (
        select 1
        from public.team_members tm
        left join public.profiles teammate on teammate.id = tm.teammate_profile_id
        left join public.profiles added_by on added_by.id = tm.added_by_profile_id
        where (
            tm.team_request_id = any($1)
            or tm.connection_id = any($2)
          )
          and (
            coalesce(teammate.is_demo, false) = false
            or coalesce(added_by.is_demo, false) = false
          )
      )
    $sql$
    into has_non_demo
    using target_request_ids, target_connection_ids;
    if has_non_demo then
      raise exception
        'The target class has a team-member row involving a non-demo profile; aborting without deleting data.';
    end if;
  end if;

  if to_regclass('public.reviews') is not null then
    execute $sql$
      select exists (
        select 1
        from public.reviews r
        left join public.profiles reviewer on reviewer.id = r.reviewer_profile_id
        join public.profiles reviewed on reviewed.id = r.reviewed_profile_id
        where (
            r.connection_id = any($1)
            or r.team_request_id = any($2)
          )
          and (
            coalesce(reviewed.is_demo, false) = false
            or (
              r.reviewer_profile_id is not null
              and coalesce(reviewer.is_demo, false) = false
            )
          )
      )
    $sql$
    into has_non_demo
    using target_connection_ids, target_request_ids;
    if has_non_demo then
      raise exception
        'The target class has a review involving a non-demo profile; aborting without deleting data.';
    end if;
  end if;

  if to_regclass('public.match_feedback') is not null then
    execute $sql$
      select exists (
        select 1
        from public.match_feedback mf
        join public.profiles reviewer on reviewer.id = mf.reviewer_profile_id
        where (
            mf.connection_id = any($1)
            or mf.team_request_id = any($2)
          )
          and coalesce(reviewer.is_demo, false) = false
      )
    $sql$
    into has_non_demo
    using target_connection_ids, target_request_ids;
    if has_non_demo then
      raise exception
        'The target class has match feedback involving a non-demo profile; aborting without deleting data.';
    end if;
  end if;

  if to_regclass('public.messages') is not null then
    execute $sql$
      select exists (
        select 1
        from public.messages m
        join public.profiles sender on sender.id = m.sender_profile_id
        where m.connection_id = any($1)
          and coalesce(sender.is_demo, false) = false
      )
    $sql$
    into has_non_demo
    using target_connection_ids;
    if has_non_demo then
      raise exception
        'The target class has a message authored by a non-demo profile; aborting without deleting data.';
    end if;
  end if;

  if to_regclass('public.notifications') is not null then
    execute $sql$
      select exists (
        select 1
        from public.notifications n
        join public.profiles recipient on recipient.id = n.recipient_profile_id
        left join public.profiles actor on actor.id = n.actor_profile_id
        where n.connection_id = any($1)
          and (
            coalesce(recipient.is_demo, false) = false
            or (
              n.actor_profile_id is not null
              and coalesce(actor.is_demo, false) = false
            )
          )
      )
    $sql$
    into has_non_demo
    using target_connection_ids;
    if has_non_demo then
      raise exception
        'The target class has a notification involving a non-demo profile; aborting without deleting data.';
    end if;
  end if;

  if to_regclass('public.teammate_relationships') is not null then
    execute $sql$
      select exists (
        select 1
        from public.teammate_relationships rel
        join public.profiles profile_a on profile_a.id = rel.profile_a_id
        join public.profiles profile_b on profile_b.id = rel.profile_b_id
        where (
            rel.connection_id = any($1)
            or rel.request_a_id = any($2)
            or rel.request_b_id = any($2)
          )
          and (
            coalesce(profile_a.is_demo, false) = false
            or coalesce(profile_b.is_demo, false) = false
          )
      )
    $sql$
    into has_non_demo
    using target_connection_ids, target_request_ids;
    if has_non_demo then
      raise exception
        'The target class has a teammate relationship involving a non-demo profile; aborting without deleting data.';
    end if;
  end if;

  if to_regclass('public.ai_match_results') is not null then
    execute $sql$
      select exists (
        select 1
        from public.ai_match_results amr
        join public.team_requests source_request on source_request.id = amr.request_id
        join public.profiles source_owner on source_owner.id = source_request.profile_id
        join public.profiles candidate on candidate.id = amr.candidate_profile_id
        left join public.team_requests candidate_request
          on candidate_request.id = amr.candidate_request_id
        left join public.profiles candidate_owner
          on candidate_owner.id = candidate_request.profile_id
        where (
            amr.request_id = any($1)
            or amr.candidate_request_id = any($1)
          )
          and (
            coalesce(source_owner.is_demo, false) = false
            or coalesce(candidate.is_demo, false) = false
            or (
              amr.candidate_request_id is not null
              and coalesce(candidate_owner.is_demo, false) = false
            )
          )
      )
    $sql$
    into has_non_demo
    using target_request_ids;
    if has_non_demo then
      raise exception
        'The target class has an AI match result involving a non-demo profile; aborting without deleting data.';
    end if;
  end if;

  -- Delete dependents first, always scoped to the collected IDs.
  if to_regclass('public.teammate_relationships') is not null then
    execute $sql$
      delete from public.teammate_relationships
      where connection_id = any($1)
         or request_a_id = any($2)
         or request_b_id = any($2)
    $sql$
    using target_connection_ids, target_request_ids;
  end if;

  if to_regclass('public.team_members') is not null then
    execute $sql$
      delete from public.team_members
      where team_request_id = any($1)
         or connection_id = any($2)
    $sql$
    using target_request_ids, target_connection_ids;
  end if;

  if to_regclass('public.notifications') is not null then
    execute 'delete from public.notifications where connection_id = any($1)'
    using target_connection_ids;
  end if;

  if to_regclass('public.messages') is not null then
    execute 'delete from public.messages where connection_id = any($1)'
    using target_connection_ids;
  end if;

  if to_regclass('public.reviews') is not null then
    execute $sql$
      delete from public.reviews
      where connection_id = any($1)
         or team_request_id = any($2)
    $sql$
    using target_connection_ids, target_request_ids;
  end if;

  if to_regclass('public.match_feedback') is not null then
    execute $sql$
      delete from public.match_feedback
      where connection_id = any($1)
         or team_request_id = any($2)
    $sql$
    using target_connection_ids, target_request_ids;
  end if;

  if to_regclass('public.ai_match_results') is not null then
    execute $sql$
      delete from public.ai_match_results
      where request_id = any($1)
         or candidate_request_id = any($1)
    $sql$
    using target_request_ids;
  end if;

  delete from public.connections
  where id = any(target_connection_ids);

  delete from public.team_requests
  where id = any(target_request_ids);

  delete from public.class_members
  where class_id = target_class_id;

  delete from public.classes
  where id = target_class_id
    and is_demo = true
    and university = 'University of Technology Ho Chi Minh City'
    and school = 'SSET'
    and course_code = 'COSC2440'
    and class_session = 'Session 01'
    and join_code = '88889999'
    and demo_class_code is null;
  get diagnostics removed_count = row_count;

  if removed_count <> 1 then
    raise exception
      'The exact target class was not deleted; transaction will roll back.';
  end if;
end;
$$;

commit;
