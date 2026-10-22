-- Read-only preflight. NULL inspects active festivals; set the UUID to scope it.
WITH scope AS (
  SELECT NULL::uuid AS festival_id
), target AS (
  SELECT f.id FROM public.festival_calendar f CROSS JOIN scope s
  WHERE (s.festival_id IS NULL AND f.is_active IS TRUE) OR f.id=s.festival_id
), activity AS (
  SELECT r.id,
    (SELECT count(*) FROM public.mark_entries m WHERE m.registration_id=r.id) AS mark_count,
    (SELECT count(*) FROM public.results res WHERE res.registration_id=r.id) AS result_count
  FROM public.registrations r JOIN target t ON t.id=r.festival_id
), groups AS (
  SELECT r.festival_id,r.item_id,r.organisation_id,
    count(*) AS registration_count,
    count(*) FILTER (WHERE r.entry_kind='participant') AS legacy_member_registrations,
    count(*) FILTER (WHERE r.entry_kind='general_team') AS team_entry_count,
    count(*) FILTER (WHERE r.entry_kind='general_team' AND to_jsonb(r)->>'group_leader_participant_id' IS NULL) AS missing_leader_count,
    sum(a.mark_count) AS mark_count,sum(a.result_count) AS result_count,
    jsonb_agg(jsonb_build_object('registration_id',r.id,'entry_kind',r.entry_kind,
      'participant_id',r.participant_id,'legacy_number',r.entry_chest_number,
      'leader_participant_id',to_jsonb(r)->>'group_leader_participant_id',
      'verified',r.is_verified,'code_letter',r.code_letter,
      'mark_count',a.mark_count,'result_count',a.result_count) ORDER BY r.id) AS entries
  FROM public.registrations r JOIN public.items i ON i.id=r.item_id
  JOIN activity a ON a.id=r.id WHERE i.participation_type='group'
  GROUP BY r.festival_id,r.item_id,r.organisation_id
)
SELECT g.*,i.item_code,i.category_codes,o.name AS team_name,
  CASE WHEN legacy_member_registrations>0 THEN 'LEGACY_REGISTRATIONS_REVIEW_REQUIRED'
       WHEN team_entry_count>1 THEN 'MULTIPLE_TEAM_ENTRIES_REVIEW_REQUIRED'
       WHEN missing_leader_count>0 THEN 'CHECK_LEADER_IN_EDIT_MEMBERS'
       ELSE 'LEADER_ASSIGNED' END AS review_status
FROM groups g JOIN public.items i ON i.id=g.item_id
LEFT JOIN public.organisations o ON o.id=g.organisation_id
ORDER BY g.festival_id,i.item_code,o.name;
