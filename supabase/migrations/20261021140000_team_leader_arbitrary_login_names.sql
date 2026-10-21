BEGIN;

-- Move legacy first-login markers to server-managed metadata. New markers are
-- written to app_metadata, which authenticated users cannot edit themselves.
UPDATE auth.users AS auth_user
SET raw_app_meta_data = COALESCE(auth_user.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
  'must_change_credentials',
  (COALESCE(auth_user.raw_app_meta_data ->> 'must_change_credentials' = 'true', false)
    OR COALESCE(auth_user.raw_user_meta_data ->> 'must_change_credentials' = 'true', false)),
  'must_change_password',
  (COALESCE(auth_user.raw_app_meta_data ->> 'must_change_password' = 'true', false)
    OR COALESCE(auth_user.raw_user_meta_data ->> 'must_change_password' = 'true', false))
)
FROM public.profiles AS profile
WHERE profile.id = auth_user.id
  AND profile.role = 'team_leader'
  AND (
    auth_user.raw_user_meta_data ->> 'must_change_credentials' = 'true'
    OR auth_user.raw_user_meta_data ->> 'must_change_password' = 'true'
  );

-- Resolve arbitrary Team Leader usernames without changing the generic
-- username resolver used by organisation administrators.
CREATE OR REPLACE FUNCTION public.resolve_team_leader_login_email(p_username text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_match_count integer;
  v_email text;
BEGIN
  IF p_username IS NULL OR p_username = '' THEN
    RETURN NULL;
  END IF;

  SELECT count(*), min(auth_user.email)
    INTO v_match_count, v_email
  FROM public.profiles AS profile
  JOIN auth.users AS auth_user ON auth_user.id = profile.id
  WHERE profile.role = 'team_leader'
    AND profile.team_leader_code = p_username;

  IF v_match_count <> 1 THEN
    RETURN NULL;
  END IF;

  RETURN v_email;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_team_leader_login_email(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_team_leader_login_email(text)
  TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
