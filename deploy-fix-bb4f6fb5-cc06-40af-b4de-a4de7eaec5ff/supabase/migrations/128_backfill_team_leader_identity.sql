-- Backfill only missing Team Leader login identity fields.
-- Existing values, participant links, roles, and Auth users are preserved.
WITH candidates AS (
  SELECT
    p.id,
    'teamleader_' ||
      left(
        regexp_replace(
          lower(coalesce(nullif(trim(p.full_name), ''), 'leader')),
          '[^a-z0-9]+',
          '_',
          'g'
        ),
        20
      ) || '_' || left(replace(p.id::text, '-', ''), 8) AS generated_code,
    nullif(lower(trim(u.email)), '') AS auth_email
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.role = 'team_leader'
    AND (p.team_leader_code IS NULL OR p.team_leader_email IS NULL)
)
UPDATE public.profiles p
SET
  team_leader_code = coalesce(p.team_leader_code, c.generated_code),
  team_leader_email = coalesce(p.team_leader_email, c.auth_email, c.generated_code || '@sahi.local')
FROM candidates c
WHERE p.id = c.id;

NOTIFY pgrst, 'reload schema';
