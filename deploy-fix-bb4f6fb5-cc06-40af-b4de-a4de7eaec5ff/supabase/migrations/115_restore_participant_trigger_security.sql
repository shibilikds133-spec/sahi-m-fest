-- The College Fest child-tenant fix recreates the trigger function. Restore
-- trigger-only SECURITY DEFINER execution so it can call the protected
-- festival template resolver.

BEGIN;

ALTER FUNCTION public.validate_participant_category()
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;

ALTER FUNCTION public.validate_participant_category() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.validate_participant_category()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.resolve_festival_template(uuid)
  FROM PUBLIC, anon, authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
