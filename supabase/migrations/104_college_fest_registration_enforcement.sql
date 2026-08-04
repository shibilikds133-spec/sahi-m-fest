-- ============================================================================
-- MIGRATION 104: COLLEGE FEST REGISTRATION ENFORCEMENT (BATCH 3A)
-- ============================================================================
-- STATUS: REVIEW-READY DRAFT. THIS MIGRATION HAS NEVER BEEN APPLIED.
--
-- DEPENDS ON: Migration 103 (committed), which provides:
--   public.resolve_festival_template(uuid) — SECURITY DEFINER, RLS-independent,
--     fail-closed template resolver for festival_calendar.festival_template;
--   College participant category enforcement (validate_participant_category);
--   College item category enforcement (validate_item_categories_for_template).
--
-- SCOPE (confirmed):
--   1. College Fest registration category compatibility: a registration for a
--      College Fest festival must reference a participant whose canonical
--      category is contained in the referenced item's canonical category list.
--   2. RLS-independent lookups through two new narrowly scoped SECURITY
--      DEFINER resolvers (participant category, item categories) so the check
--      never depends on the caller's RLS visibility of participants/items
--      (hybrid tenant model preserved).
--   3. Safe existing-data prechecks (read-only counts; abort on violations).
--   4. Required trigger/function grants and comments.
--
-- FAIL-CLOSED SEMANTICS (as in Migration 103):
--   * NULL festival id -> RETURN NEW (existing behavior preserved);
--   * non-null festival id, unknown festival -> resolver RAISES;
--   * unexpected/NULL template -> resolver RAISES;
--   * unknown participant/item id -> resolver RAISES;
--   * College item with empty/null category list -> validator RAISES.
--
-- SAHITHYOLSAV BEHAVIOR: unchanged. All checks below RETURN NEW for any
-- non-College (or festival-less) registration.
--
-- EXPLICITLY EXCLUDED: group members, schedules, results, leaderboards,
-- chest numbers, tenant hierarchy changes. No data is rewritten or deleted.
-- ============================================================================

BEGIN;

-------------------------------------------------------------------------------
-- 1. SCHEMA/OBJECT PRECHECKS
-------------------------------------------------------------------------------
-- Abort (rolling back the whole migration) when the reconciled history
-- 001-103 is not present or when a foreign/partial implementation exists.
-- Checks report object names and counts only.
-------------------------------------------------------------------------------
DO $$
DECLARE
  v_col_ok boolean;
  v_constraint_def text;
  v_proc_count int;
BEGIN
  -- 1a. festival_calendar.festival_template (Migration 102) compatible.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'festival_calendar'
      AND column_name = 'festival_template'
  ) THEN
    RAISE EXCEPTION 'Migration 102 required: festival_calendar.festival_template does not exist';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'festival_calendar'
      AND column_name = 'festival_template'
      AND data_type = 'text'
      AND is_nullable = 'NO'
      AND column_default = '''sahithyolsav''::text'
  ) INTO v_col_ok;
  IF NOT v_col_ok THEN
    RAISE EXCEPTION 'festival_calendar.festival_template has an incompatible definition (expected text NOT NULL DEFAULT ''sahithyolsav'')';
  END IF;

  -- 1b. Allowed-template CHECK constraint (Migration 102) exact definition.
  SELECT pg_get_constraintdef(oid) INTO v_constraint_def
  FROM pg_constraint
  WHERE conname = 'ck_festival_calendar_festival_template'
    AND conrelid = 'public.festival_calendar'::regclass;
  IF v_constraint_def IS NULL THEN
    RAISE EXCEPTION 'Migration 102 required: CHECK constraint ck_festival_calendar_festival_template is missing';
  END IF;
  IF v_constraint_def <> 'CHECK ((festival_template = ANY (ARRAY[''sahithyolsav''::text, ''college_fest''::text])))' THEN
    RAISE EXCEPTION 'Existing CHECK constraint ck_festival_calendar_festival_template has an unexpected definition: %', v_constraint_def;
  END IF;

  -- 1c. Migration 103 dependency: the RLS-independent template resolver.
  SELECT count(*) INTO v_proc_count
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
    AND proname = 'resolve_festival_template';
  IF v_proc_count <> 1 THEN
    RAISE EXCEPTION 'Migration 103 required: exactly one public.resolve_festival_template(uuid) expected (found %)', v_proc_count;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname = 'resolve_festival_template'
      AND oidvectortypes(proargtypes) = 'uuid'
      AND proretset = false
      AND prosecdef = true
  ) THEN
    RAISE EXCEPTION 'Migration 103 required: public.resolve_festival_template(uuid) must be SECURITY DEFINER';
  END IF;

  -- 1d. registrations must expose festival_id, participant_id, item_id (uuid).
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'registrations'
      AND column_name = 'festival_id' AND data_type = 'uuid'
  ) THEN
    RAISE EXCEPTION 'Dependency missing: registrations.festival_id (uuid) not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'registrations'
      AND column_name = 'participant_id' AND data_type = 'uuid'
  ) THEN
    RAISE EXCEPTION 'Dependency missing: registrations.participant_id (uuid) not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'registrations'
      AND column_name = 'item_id' AND data_type = 'uuid'
  ) THEN
    RAISE EXCEPTION 'Dependency missing: registrations.item_id (uuid) not found';
  END IF;

  -- 1e. participants.category_code and items.category_codes exist.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'participants'
      AND column_name = 'category_code' AND data_type = 'text'
  ) THEN
    RAISE EXCEPTION 'Dependency missing: participants.category_code (text) not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'items'
      AND column_name = 'category_codes'
      AND data_type = 'ARRAY' AND udt_name = '_text'
  ) THEN
    RAISE EXCEPTION 'Dependency missing: items.category_codes (text[]) not found';
  END IF;

  -- 1f. Proposed resolvers must not already exist (any arity).
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname = 'resolve_participant_category'
  ) THEN
    RAISE EXCEPTION 'Proposed function public.resolve_participant_category already exists with an unexpected definition';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname = 'resolve_item_categories'
  ) THEN
    RAISE EXCEPTION 'Proposed function public.resolve_item_categories already exists with an unexpected definition';
  END IF;

  -- 1g. Proposed registration validator function/trigger must not exist.
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname = 'validate_registration_category_compatibility'
  ) THEN
    RAISE EXCEPTION 'Proposed function public.validate_registration_category_compatibility already exists with an unexpected definition';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_validate_registration_category_compatibility'
      AND tgrelid = 'public.registrations'::regclass
  ) THEN
    RAISE EXCEPTION 'Proposed trigger trg_validate_registration_category_compatibility already exists on public.registrations with an unexpected definition';
  END IF;
END;
$$;

-------------------------------------------------------------------------------
-- 2. EXISTING-DATA PRECHECKS
-------------------------------------------------------------------------------
-- Read-only. Abort (rolling back the whole migration) when any existing
-- College Fest festival already has incompatible registrations. Sahithyolsav
-- registrations are never evaluated. Error messages carry safe counts only.
-------------------------------------------------------------------------------
DO $$
DECLARE
  v_bad_registrations int := 0;
  v_orphan_registrations int := 0;
BEGIN
  -- 2a. College Fest registrations whose participant category is not
  --     contained in the referenced item's category list. Registrations with
  --     NULL participant_id or item_id are left untouched (existing behavior).
  SELECT count(*) INTO v_bad_registrations
  FROM public.registrations r
  WHERE r.festival_id IN (
        SELECT fc.id FROM public.festival_calendar fc
        WHERE fc.festival_template = 'college_fest'
      )
    AND r.participant_id IS NOT NULL
    AND r.item_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.participants p
      JOIN public.items i ON i.id = r.item_id
      WHERE p.id = r.participant_id
        AND p.category_code IS NOT NULL
        AND p.category_code = ANY (i.category_codes)
    );

  IF v_bad_registrations > 0 THEN
    RAISE EXCEPTION 'Existing College Fest registration rows are incompatible with item categories: % row(s) found. No data was modified.',
      v_bad_registrations;
  END IF;

  -- 2b. Registration rows with unknown/missing festival references.
  SELECT count(*) INTO v_orphan_registrations
  FROM public.registrations r
  LEFT JOIN public.festival_calendar fc ON fc.id = r.festival_id
  WHERE r.festival_id IS NOT NULL AND fc.id IS NULL;

  IF v_orphan_registrations > 0 THEN
    RAISE EXCEPTION 'Registration rows reference unknown festivals: % row(s) found. No data was modified.',
      v_orphan_registrations;
  END IF;
END;
$$;

-------------------------------------------------------------------------------
-- 3. RLS-INDEPENDENT RESOLVERS (SECURITY DEFINER)
-------------------------------------------------------------------------------
-- The registration validator must compare the participant's category with
-- the item's category list without depending on the caller's RLS visibility
-- of participants/items (hybrid tenant model). Both helpers are narrowly
-- scoped SECURITY DEFINER functions: they read ONE field of ONE table,
-- use SET search_path = public, pg_temp, and FAIL CLOSED on non-null
-- unknown ids. Direct execution is revoked from PUBLIC/anon/authenticated
-- (section 6).
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_participant_category(p_participant_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_category text;
BEGIN
  IF p_participant_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT p.category_code INTO v_category
  FROM public.participants p
  WHERE p.id = p_participant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant % not found while resolving participant category', p_participant_id;
  END IF;

  RETURN v_category;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_item_categories(p_item_id uuid)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_categories text[];
BEGIN
  IF p_item_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT i.category_codes INTO v_categories
  FROM public.items i
  WHERE i.id = p_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item % not found while resolving item categories', p_item_id;
  END IF;

  RETURN v_categories;
END;
$$;

-------------------------------------------------------------------------------
-- 4. REGISTRATION VALIDATOR
-------------------------------------------------------------------------------
-- Trigger function for public.registrations; fires only on INSERT or on
-- UPDATE of festival_id / participant_id / item_id.
--
-- College Fest:
--   * festival id resolves to 'college_fest' (unknown festivals fail closed
--     via resolve_festival_template);
--   * a registration with NULL participant_id or item_id passes through
--     (existing behavior is preserved for partial rows);
--   * the participant's category must be contained in the item's category
--     list; an empty/NULL item category list fails closed (a College item
--     cannot be registered without categories);
--   * category comparison is exact (canonical codes only; 103 already
--     guarantees canonical storage for both sides).
-- Sahithyolsav (and festival-less rows): RETURN NEW unchanged.
-- No tenant-id equality rule is introduced (hybrid tenant model preserved).
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_registration_category_compatibility()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_template text;
  v_participant_category text;
  v_item_categories text[];
BEGIN
  -- No festival context: leave current behavior untouched.
  IF NEW.festival_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- RLS-independent template resolution; unknown festival fails closed.
  v_template := public.resolve_festival_template(NEW.festival_id);

  -- Not a College Fest registration: pass through unchanged.
  IF v_template <> 'college_fest' THEN
    RETURN NEW;
  END IF;

  -- Partial rows keep their existing behavior.
  IF NEW.participant_id IS NULL OR NEW.item_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- RLS-independent lookups; unknown ids fail closed.
  v_participant_category := public.resolve_participant_category(NEW.participant_id);
  v_item_categories := public.resolve_item_categories(NEW.item_id);

  IF v_item_categories IS NULL OR cardinality(v_item_categories) = 0 THEN
    RAISE EXCEPTION 'College Fest item % has no categories; registration is not allowed.',
      NEW.item_id;
  END IF;

  IF v_participant_category IS NULL
     OR v_participant_category NOT IN (SELECT unnest(v_item_categories)) THEN
    RAISE EXCEPTION 'College Fest registration: participant category % does not match item % categories (%).',
      v_participant_category, NEW.item_id, array_to_string(v_item_categories, ', ');
  END IF;

  RETURN NEW;
END;
$$;

-------------------------------------------------------------------------------
-- 5. REGISTRATION TRIGGER
-------------------------------------------------------------------------------
CREATE TRIGGER trg_validate_registration_category_compatibility
  BEFORE INSERT OR UPDATE OF festival_id, participant_id, item_id
  ON public.registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_registration_category_compatibility();

-------------------------------------------------------------------------------
-- 6. AUTHORIZATION / GRANTS
-------------------------------------------------------------------------------
-- All three functions are internal helpers only: no client path may call
-- them directly, so direct execution is revoked from PUBLIC, anon and
-- authenticated. Trigger-internal invocation does not require EXECUTE and
-- remains unaffected by these revokes. No RLS is weakened or touched.
-------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.validate_registration_category_compatibility() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_registration_category_compatibility() FROM anon;
REVOKE ALL ON FUNCTION public.validate_registration_category_compatibility() FROM authenticated;
REVOKE ALL ON FUNCTION public.resolve_participant_category(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_participant_category(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.resolve_participant_category(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.resolve_item_categories(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_item_categories(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.resolve_item_categories(uuid) FROM authenticated;

-------------------------------------------------------------------------------
-- 7. COMMENTS
-------------------------------------------------------------------------------
COMMENT ON FUNCTION public.resolve_participant_category(uuid) IS
  'Narrowly scoped SECURITY DEFINER resolver (Migration 104): returns participants.category_code for a participant id, independent of caller RLS. NULL input returns NULL; non-null unknown ids raise (fail closed). Direct execution revoked; trigger-internal use only.';

COMMENT ON FUNCTION public.resolve_item_categories(uuid) IS
  'Narrowly scoped SECURITY DEFINER resolver (Migration 104): returns items.category_codes for an item id, independent of caller RLS. NULL input returns NULL; non-null unknown ids raise (fail closed). Direct execution revoked; trigger-internal use only.';

COMMENT ON FUNCTION public.validate_registration_category_compatibility() IS
  'College Fest registration category compatibility (Migration 104): participant category must be contained in the item category list. Sahithyolsav and festival-less registrations pass through unchanged. RLS-independent via SECURITY DEFINER resolvers; unknown festivals/participants/items fail closed. Trigger-internal only; direct execution revoked.';

COMMENT ON TRIGGER trg_validate_registration_category_compatibility ON public.registrations IS
  'Enforces College Fest registration/participant/item category compatibility on insert or when festival_id/participant_id/item_id change (Migration 104).';

COMMIT;

-- Reload PostgREST schema cache so the new trigger and functions are picked
-- up immediately.
NOTIFY pgrst, 'reload schema';

-- END OF MIGRATION 104
