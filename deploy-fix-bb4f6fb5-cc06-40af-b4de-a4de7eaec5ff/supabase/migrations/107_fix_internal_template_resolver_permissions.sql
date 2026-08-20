-- 107_fix_internal_template_resolver_permissions.sql
-- Allow trigger-internal calls to execute-revoked College Fest resolvers
-- without exposing any helper or validator as a client-callable RPC.

BEGIN;

DO $$
DECLARE
  v_name text;
  v_count integer;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'validate_participant_category',
    'validate_item_categories_for_template',
    'validate_registration_category_compatibility'
  ] LOOP
    SELECT count(*) INTO v_count
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = v_name
      AND pg_catalog.pg_get_function_identity_arguments(p.oid) = ''
      AND p.prorettype = 'pg_catalog.trigger'::pg_catalog.regtype;

    IF v_count <> 1 THEN
      RAISE EXCEPTION 'Expected exactly one public.%() trigger function; found %', v_name, v_count;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'resolve_festival_template'
    AND pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_festival_id uuid'
    AND p.prorettype = 'pg_catalog.text'::pg_catalog.regtype
    AND p.prosecdef;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one SECURITY DEFINER public.resolve_festival_template(uuid); found %', v_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'participants'
      AND t.tgname = 'trg_validate_participant_category'
      AND t.tgfoid = 'public.validate_participant_category()'::pg_catalog.regprocedure
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'Participant category validation trigger attachment is missing or unexpected';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'items'
      AND t.tgname = 'trg_validate_item_categories_for_template'
      AND t.tgfoid = 'public.validate_item_categories_for_template()'::pg_catalog.regprocedure
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'Item category validation trigger attachment is missing or unexpected';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'registrations'
      AND t.tgname = 'trg_validate_registration_category_compatibility'
      AND t.tgfoid = 'public.validate_registration_category_compatibility()'::pg_catalog.regprocedure
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'Registration category validation trigger attachment is missing or unexpected';
  END IF;
END;
$$;

-- These three functions are reachable only through fixed table triggers.
-- SECURITY DEFINER is required because their internal resolver functions are
-- deliberately not executable by PUBLIC, anon, or authenticated.
ALTER FUNCTION public.validate_participant_category()
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.validate_item_categories_for_template()
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.validate_registration_category_compatibility()
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;

ALTER FUNCTION public.validate_participant_category() OWNER TO postgres;
ALTER FUNCTION public.validate_item_categories_for_template() OWNER TO postgres;
ALTER FUNCTION public.validate_registration_category_compatibility() OWNER TO postgres;

-- Defense in depth: trigger execution does not require client EXECUTE.
REVOKE ALL ON FUNCTION public.validate_participant_category() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_item_categories_for_template() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_registration_category_compatibility() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_festival_template(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_participant_category(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_item_categories(uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.validate_participant_category() IS
  'Trigger-only participant category validator. SECURITY DEFINER solely to call internal execute-revoked resolvers and read festival categories; fixed search_path; direct client execution revoked.';
COMMENT ON FUNCTION public.validate_item_categories_for_template() IS
  'Trigger-only item category validator. SECURITY DEFINER solely to call internal execute-revoked resolvers and read festival categories; fixed search_path; direct client execution revoked.';
COMMENT ON FUNCTION public.validate_registration_category_compatibility() IS
  'Trigger-only registration category validator. SECURITY DEFINER solely to call internal execute-revoked resolvers; fixed search_path; direct client execution revoked.';

COMMIT;
NOTIFY pgrst, 'reload schema';
