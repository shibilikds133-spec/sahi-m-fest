-- Migration 157: restore trigger security after General category validator updates.
--
-- Migrations 114 and 155 replaced trigger functions with CREATE OR REPLACE
-- FUNCTION definitions that did not retain SECURITY DEFINER. Those trigger
-- functions call the execute-revoked resolve_festival_template() helper, so
-- authenticated category/item/registration writes failed with 42501.
--
-- This migration changes execution security only. It does not alter rows,
-- category rules, RLS policies, registrations, marks, schedules or results.

BEGIN;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc
    WHERE oid = 'public.validate_participant_category()'::pg_catalog.regprocedure
  ) THEN
    RAISE EXCEPTION 'Required trigger function public.validate_participant_category() is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc
    WHERE oid = 'public.validate_item_categories_for_template()'::pg_catalog.regprocedure
  ) THEN
    RAISE EXCEPTION 'Required trigger function public.validate_item_categories_for_template() is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc
    WHERE oid = 'public.validate_registration_category_compatibility()'::pg_catalog.regprocedure
  ) THEN
    RAISE EXCEPTION 'Required trigger function public.validate_registration_category_compatibility() is missing';
  END IF;
END
$do$;

-- Trigger-only functions need definer execution to call the internal,
-- execute-revoked resolver functions without exposing those resolvers to the
-- client roles.
ALTER FUNCTION public.validate_participant_category()
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.validate_item_categories_for_template()
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.validate_registration_category_compatibility()
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;

-- Keep ownership explicit and client execution blocked. Table triggers can
-- still invoke these functions; no public RPC surface is added.
ALTER FUNCTION public.validate_participant_category() OWNER TO postgres;
ALTER FUNCTION public.validate_item_categories_for_template() OWNER TO postgres;
ALTER FUNCTION public.validate_registration_category_compatibility() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.validate_participant_category()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_item_categories_for_template()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_registration_category_compatibility()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_festival_template(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_participant_category(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_item_categories(uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.validate_item_categories_for_template() IS
  'Trigger-only item category validator. SECURITY DEFINER is required to call the internal template resolver; fixed search_path and direct client execution revoked.';
COMMENT ON FUNCTION public.validate_registration_category_compatibility() IS
  'Trigger-only registration category validator. SECURITY DEFINER is required to call internal category resolvers; fixed search_path and direct client execution revoked.';

COMMIT;

NOTIFY pgrst, 'reload schema';
