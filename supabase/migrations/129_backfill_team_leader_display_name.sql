-- Restore display names only for linked Team Leader profiles that are blank.
-- This does not change roles, Auth identities, participant links, or non-blank names.
UPDATE public.profiles p
SET full_name = participant.name
FROM public.participants participant
WHERE participant.user_id = p.id
  AND p.role = 'team_leader'
  AND nullif(trim(p.full_name), '') IS NULL
  AND nullif(trim(participant.name), '') IS NOT NULL;

NOTIFY pgrst, 'reload schema';
