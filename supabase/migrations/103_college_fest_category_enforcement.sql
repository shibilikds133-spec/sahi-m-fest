-- ============================================================================
-- MIGRATION 103: COLLEGE FEST CATEGORY ENFORCEMENT (BATCH 3A)
-- ============================================================================
-- STATUS: REVIEW-READY DRAFT. THIS MIGRATION HAS NEVER BEEN APPLIED.
--
-- DEPENDS ON: Migration 102 (committed) which introduces:
--   tenants.festival_template text NOT NULL DEFAULT 'sahithyolsav'
--   festival_calendar.festival_template text NOT NULL DEFAULT 'sahithyolsav'
--   ck_tenants_festival_template / ck_festival_calendar_festival_template
--
-- SCOPE (confirmed for Batch 3A):
--   1. Template-aware participant category dispatcher. The body of the
--      existing trigger function public.validate_participant_category() is
--      replaced; the existing trigger trg_validate_participant_category is
--      preserved (no new participant trigger, no trigger-order ambiguity).
--   2. College participant category enforcement: manual selection only;
--      category required; exact canonical storage (SUB_JUNIOR / JUNIOR /
--      SENIOR); no JR/SR/GN aliases; no age/DOB/class/education inference.
--   3. College item category enforcement: new trigger function
--      public.validate_item_categories_for_template() and trigger
--      trg_validate_item_categories_for_template on public.items.
--   4. Safe existing-data prechecks (read-only counts; abort on violations).
--   5. Trigger/function grants and comments.
--
-- RLS-SAFE TEMPLATE RESOLUTION (Batch 3A correction):
--   Both trigger functions resolve the authoritative template through the
--   narrowly scoped SECURITY DEFINER helper public.resolve_festival_template()
--   so resolution is independent of the caller's RLS visibility on
--   festival_calendar (a hybrid child-tenant admin may not see the festival
--   row of the festival they legitimately write to). The helper:
--     * reads ONLY festival_calendar.festival_template;
--     * SET search_path = public, pg_temp;
--     * returns NULL for a NULL festival id (caller keeps existing behavior);
--     * FAILS CLOSED: raises for a non-null festival id whose row is missing,
--       and for an unexpected or NULL template;
--     * direct execution is revoked from PUBLIC/anon/authenticated.
--
-- COLLEGE POLICY (confirmed):
--   Canonical categories: SUB_JUNIOR, JUNIOR, SENIOR.
--   Manual-only; category non-null; exact canonical storage; no aliases;
--   no DOB/age/class/education inference.
--   College item category_codes arrays must be one-dimensional.
--   Sahithyolsav behavior must remain UNCHANGED (Migration 006 branch is
--   copied faithfully below, including its fixed 2026 cutoff year).
--
-- AUTHORITATIVE TEMPLATE SOURCE: NEW.festival_id ->
--   public.festival_calendar.festival_template (never NEW.tenant_id).
--   A child-tenant participant may legitimately belong to a festival owned
--   by another tenant in the existing hierarchy; migration 103 is category
--   enforcement, not hierarchy redesign.
--
-- EXPLICITLY DEFERRED TO MIGRATION 104: registration enforcement.
--
-- NO EXISTING DATA IS REWRITTEN, NORMALIZED OR DELETED BY THIS MIGRATION.
-- ============================================================================

BEGIN;

-------------------------------------------------------------------------------
-- 1. SCHEMA/OBJECT PRECHECKS
-------------------------------------------------------------------------------
-- Fail fast (inside the transaction, so the whole migration rolls back)
-- when the reconciled history 001-102 is not present or when a foreign or
-- partial implementation already exists. Checks report object names and
-- counts only; no participant or private data is printed.
-------------------------------------------------------------------------------
DO $$
DECLARE
  v_col_ok boolean;
  v_constraint_def text;
  v_tgtype smallint;
  v_proc_count int;
BEGIN
  -- 1a. festival_calendar.festival_template (Migration 102) must exist with
  --     a compatible definition: text, NOT NULL, default 'sahithyolsav'.
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

  -- 1b. Allowed-template CHECK constraint must exist with the exact
  --     Migration 102 definition (never silently absorb a foreign one).
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

  -- 1c. participants must expose festival_id (uuid) and category_code (text).
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'participants'
      AND column_name = 'festival_id' AND data_type = 'uuid'
  ) THEN
    RAISE EXCEPTION 'Dependency missing: participants.festival_id (uuid) not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'participants'
      AND column_name = 'category_code' AND data_type = 'text'
  ) THEN
    RAISE EXCEPTION 'Dependency missing: participants.category_code (text) not found';
  END IF;

  -- 1d. items must expose festival_id (uuid) and category_codes (text[]).
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'items'
      AND column_name = 'festival_id' AND data_type = 'uuid'
  ) THEN
    RAISE EXCEPTION 'Dependency missing: items.festival_id (uuid) not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'items'
      AND column_name = 'category_codes'
      AND data_type = 'ARRAY' AND udt_name = '_text'
  ) THEN
    RAISE EXCEPTION 'Dependency missing: items.category_codes (text[]) not found';
  END IF;

  -- 1e. The existing participant trigger function must match the effective
  --     history: exactly one public.validate_participant_category() with no
  --     arguments, returning trigger. Unexpected overloads abort.
  SELECT count(*) INTO v_proc_count
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
    AND proname = 'validate_participant_category';
  IF v_proc_count = 0 THEN
    RAISE EXCEPTION 'Dependency missing: trigger function public.validate_participant_category() not found (is migration 006 applied?)';
  END IF;
  IF v_proc_count > 1 THEN
    RAISE EXCEPTION 'Unexpected overloads of validate_participant_category exist (% found); migration 103 will not replace them', v_proc_count;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname = 'validate_participant_category'
      AND pg_get_function_identity_arguments(oid) = ''
      AND prorettype = 'trigger'::regtype
  ) THEN
    RAISE EXCEPTION 'Dependency missing: public.validate_participant_category() must take 0 arguments and return trigger';
  END IF;

  -- 1f. The existing participant trigger must be exactly
  --     BEFORE INSERT OR UPDATE, FOR EACH ROW (tgtype = 23) and must execute
  --     the function above.
  SELECT t.tgtype INTO v_tgtype
  FROM pg_trigger t
  WHERE t.tgname = 'trg_validate_participant_category'
    AND t.tgrelid = 'public.participants'::regclass
    AND NOT t.tgisinternal;
  IF v_tgtype IS NULL THEN
    RAISE EXCEPTION 'Dependency missing: trigger trg_validate_participant_category on public.participants not found (is migration 005 applied?)';
  END IF;
  IF v_tgtype <> 23 THEN
    RAISE EXCEPTION 'Unexpected definition of trg_validate_participant_category (expected BEFORE INSERT OR UPDATE, FOR EACH ROW)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgname = 'trg_validate_participant_category'
      AND t.tgrelid = 'public.participants'::regclass
      AND t.tgfoid = 'public.validate_participant_category()'::regprocedure
  ) THEN
    RAISE EXCEPTION 'trg_validate_participant_category does not execute public.validate_participant_category()';
  END IF;

  -- 1g. Proposed item trigger function must not already exist (any arity).
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname = 'validate_item_categories_for_template'
  ) THEN
    RAISE EXCEPTION 'Proposed function public.validate_item_categories_for_template already exists with an unexpected definition';
  END IF;

  -- 1h. Proposed item trigger must not already exist.
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_validate_item_categories_for_template'
      AND tgrelid = 'public.items'::regclass
  ) THEN
    RAISE EXCEPTION 'Proposed trigger trg_validate_item_categories_for_template already exists on public.items with an unexpected definition';
  END IF;

  -- 1i. The proposed SECURITY DEFINER template resolver must not already
  --     exist (any arity) with an unexpected definition.
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname = 'resolve_festival_template'
  ) THEN
    RAISE EXCEPTION 'Proposed function public.resolve_festival_template already exists with an unexpected definition';
  END IF;
END;
$$;

-------------------------------------------------------------------------------
-- 2. EXISTING-DATA PRECHECKS
-------------------------------------------------------------------------------
-- Read-only. Abort (rolling back the whole migration) when any existing
-- College Fest festival already holds violating participant or item rows.
-- Sahithyolsav rows are never evaluated against College rules. Error
-- messages carry safe counts only; no names or private values.
-------------------------------------------------------------------------------
DO $$
DECLARE
  v_college_participants int := 0;
  v_orphan_participants int := 0;
  v_bad_items int := 0;
BEGIN
  -- 2a. Participants of College Fest festivals: null/blank category or a
  --     category outside the canonical set (SUB_JUNIOR, JUNIOR, SENIOR).
  SELECT count(*) INTO v_college_participants
  FROM public.participants p
  WHERE p.festival_id IN (
        SELECT fc.id FROM public.festival_calendar fc
        WHERE fc.festival_template = 'college_fest'
      )
    AND (
      p.category_code IS NULL
      OR btrim(p.category_code) = ''
      OR p.category_code NOT IN ('SUB_JUNIOR', 'JUNIOR', 'SENIOR')
    );

  IF v_college_participants > 0 THEN
    RAISE EXCEPTION 'Existing College Fest participant rows violate canonical category rules: % row(s) found. No data was modified.',
      v_college_participants;
  END IF;

  -- 2b. Participant rows with unknown/missing festival references.
  SELECT count(*) INTO v_orphan_participants
  FROM public.participants p
  LEFT JOIN public.festival_calendar fc ON fc.id = p.festival_id
  WHERE p.festival_id IS NOT NULL AND fc.id IS NULL;

  IF v_orphan_participants > 0 THEN
    RAISE EXCEPTION 'Participant rows reference unknown festivals: % row(s) found. No data was modified.',
      v_orphan_participants;
  END IF;

  -- 2c. Items of College Fest festivals: null category_codes, empty array,
  --     multi-dimensional array, null/blank array elements, values outside
  --     the canonical set, or duplicate categories.
  SELECT count(*) INTO v_bad_items
  FROM public.items i
  WHERE i.festival_id IN (
        SELECT fc.id FROM public.festival_calendar fc
        WHERE fc.festival_template = 'college_fest'
      )
    AND (
      i.category_codes IS NULL
      OR cardinality(i.category_codes) = 0
      OR array_ndims(i.category_codes) <> 1
      OR EXISTS (
        SELECT 1 FROM unnest(i.category_codes) AS e(x)
        WHERE e.x IS NULL
           OR btrim(e.x) = ''
           OR e.x NOT IN ('SUB_JUNIOR', 'JUNIOR', 'SENIOR')
      )
      OR EXISTS (
        SELECT 1 FROM unnest(i.category_codes) AS e(x)
        GROUP BY e.x HAVING count(*) > 1
      )
    );

  IF v_bad_items > 0 THEN
    RAISE EXCEPTION 'Existing College Fest item rows violate canonical category rules: % row(s) found. No data was modified.',
      v_bad_items;
  END IF;
END;
$$;

-------------------------------------------------------------------------------
-- 3. TEMPLATE RESOLVER (RLS-INDEPENDENT, SECURITY DEFINER)
-------------------------------------------------------------------------------
-- Both trigger functions below resolve the authoritative festival template
-- through this single helper. SECURITY DEFINER (owned by the migration
-- runner, which bypasses RLS) guarantees that enforcement never depends on
-- the caller's RLS visibility of festival_calendar, while the helper stays
-- narrowly scoped: it reads ONLY festival_calendar.festival_template.
--
-- Fail-closed semantics:
--   * NULL p_festival_id          -> returns NULL (caller keeps existing
--                                    behavior for festival-less rows);
--   * non-null id, row missing    -> RAISE (unknown festival fails closed);
--   * unexpected or NULL template -> RAISE (impossible under 102's CHECK
--                                    constraint; kept as a defensive guard).
-- Direct execution is revoked from PUBLIC/anon/authenticated (section 7).
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_festival_template(p_festival_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_template text;
BEGIN
  IF p_festival_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT fc.festival_template INTO v_template
  FROM public.festival_calendar fc
  WHERE fc.id = p_festival_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Festival % not found while resolving festival template', p_festival_id;
  END IF;

  IF v_template IS NULL OR v_template NOT IN ('sahithyolsav', 'college_fest') THEN
    RAISE EXCEPTION 'Unexpected festival template % for festival %', v_template, p_festival_id;
  END IF;

  RETURN v_template;
END;
$$;

-------------------------------------------------------------------------------
-- 4. PARTICIPANT DISPATCHER
-------------------------------------------------------------------------------
-- Replaces ONLY the body of the existing trigger function. The trigger
-- trg_validate_participant_category is preserved (no drop/recreate), so no
-- second participant trigger and no trigger-order ambiguity is introduced.
--
-- Behavior:
--   * Resolve the authoritative template from NEW.festival_id via
--     public.resolve_festival_template() (RLS-independent; never
--     NEW.tenant_id; unknown non-null festival fails closed).
--   * College Fest: require a non-blank canonical category; reject aliases
--     (JR/SR/GN) and anything else; do NOT call ssf_get_category and do NOT
--     inspect DOB/class/education for category validation; RETURN NEW.
--   * Sahithyolsav (and NULL festival_id, preserving current FK behavior):
--     the effective Migration 006 validation is copied faithfully below,
--     including its fixed 2026 cutoff year and exact messages.
--   * A participant moved between festivals is validated against the
--     destination festival (NEW.festival_id at trigger time).
--   * Updates to DOB/class/education in College mode never alter category.
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_participant_category()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_template text;
  expected_cat text;
  p_festival_year int := 2026;
  junior_limit date := make_date(p_festival_year - 20, 5, 31);
  senior_limit date := make_date(p_festival_year - 26, 5, 31);
BEGIN
  -- Resolve the authoritative festival template (RLS-independent).
  IF NEW.festival_id IS NOT NULL THEN
    v_template := public.resolve_festival_template(NEW.festival_id);
  END IF;

  -- College Fest: manual-only, canonical categories, no inference.
  IF v_template = 'college_fest' THEN
    IF NEW.category_code IS NULL OR btrim(NEW.category_code) = '' THEN
      RAISE EXCEPTION 'College Fest participants require a category: SUB_JUNIOR, JUNIOR, or SENIOR.';
    END IF;
    IF NEW.category_code NOT IN ('SUB_JUNIOR', 'JUNIOR', 'SENIOR') THEN
      RAISE EXCEPTION 'Invalid College Fest category: %. Allowed: SUB_JUNIOR, JUNIOR, SENIOR (no JR/SR/GN aliases).',
        NEW.category_code;
    END IF;
    RETURN NEW;
  END IF;

  -- Sahithyolsav: current Migration 006 validation behavior, unchanged.
  IF NEW.dob IS NOT NULL OR NEW.education_type IS NOT NULL OR NEW.class_std IS NOT NULL THEN
    expected_cat := ssf_get_category(NEW.dob, NEW.class_std::int, NEW.education_type, p_festival_year);

    IF expected_cat IS NOT NULL AND expected_cat != NEW.category_code THEN
      RAISE EXCEPTION 'Category mismatch. Expected: %, Got: %. Check DOB, class, and education type.',
        expected_cat, NEW.category_code;
    END IF;
  END IF;

  -- DOB range validation for JUNIOR
  IF NEW.category_code = 'JUNIOR' AND NEW.dob IS NOT NULL THEN
    IF NEW.dob <= junior_limit THEN
      RAISE EXCEPTION 'JUNIOR category: DOB must be after %', junior_limit;
    END IF;
  END IF;

  -- DOB range validation for SENIOR
  IF NEW.category_code = 'SENIOR' AND NEW.dob IS NOT NULL THEN
    IF NEW.dob <= senior_limit THEN
      RAISE EXCEPTION 'SENIOR category: DOB must be after %', senior_limit;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-------------------------------------------------------------------------------
-- 5. COLLEGE ITEM VALIDATOR
-------------------------------------------------------------------------------
-- New narrowly scoped trigger function for public.items. Triggered only on
-- INSERT or on UPDATE of festival_id / category_codes.
--
-- College Fest: category_codes must be non-null, non-empty, one-dimensional,
-- contain only non-null/non-blank canonical College categories, and contain
-- no duplicates. No silent normalization; order is preserved.
-- Sahithyolsav (and NULL festival_id): RETURN NEW unchanged.
-- No registration compatibility is enforced here (deferred to 104).
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_item_categories_for_template()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_template text;
  v_elem text;
  v_dup_count int := 0;
BEGIN
  -- No festival context: leave current behavior untouched.
  IF NEW.festival_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve the authoritative festival template (RLS-independent;
  -- unknown non-null festival fails closed).
  v_template := public.resolve_festival_template(NEW.festival_id);

  -- Not a College Fest item: pass through.
  IF v_template <> 'college_fest' THEN
    RETURN NEW;
  END IF;

  IF NEW.category_codes IS NULL THEN
    RAISE EXCEPTION 'College Fest items require category_codes: SUB_JUNIOR, JUNIOR, or SENIOR.';
  END IF;

  IF cardinality(NEW.category_codes) = 0 THEN
    RAISE EXCEPTION 'College Fest items require at least one category: SUB_JUNIOR, JUNIOR, or SENIOR.';
  END IF;

  IF array_ndims(NEW.category_codes) <> 1 THEN
    RAISE EXCEPTION 'College Fest item category_codes must be a one-dimensional array.';
  END IF;

  FOREACH v_elem IN ARRAY NEW.category_codes
  LOOP
    IF v_elem IS NULL OR btrim(v_elem) = '' THEN
      RAISE EXCEPTION 'College Fest item category_codes contains a null or blank value.';
    END IF;
    IF v_elem NOT IN ('SUB_JUNIOR', 'JUNIOR', 'SENIOR') THEN
      RAISE EXCEPTION 'Invalid College Fest item category: %. Allowed: SUB_JUNIOR, JUNIOR, SENIOR (no JR/SR/GN aliases).',
        v_elem;
    END IF;
  END LOOP;

  -- Duplicate-category check, bounded by the item's own small array.
  SELECT count(*) INTO v_dup_count
  FROM (
    SELECT x
    FROM unnest(NEW.category_codes) AS x
    GROUP BY x
    HAVING count(*) > 1
  ) dup;

  IF v_dup_count > 0 THEN
    RAISE EXCEPTION 'College Fest item category_codes contains duplicate categories.';
  END IF;

  RETURN NEW;
END;
$$;

-------------------------------------------------------------------------------
-- 6. ITEM TRIGGER
-------------------------------------------------------------------------------
CREATE TRIGGER trg_validate_item_categories_for_template
  BEFORE INSERT OR UPDATE OF festival_id, category_codes
  ON public.items
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_item_categories_for_template();

-------------------------------------------------------------------------------
-- 7. AUTHORIZATION / GRANTS
-------------------------------------------------------------------------------
-- All three functions are internal helpers only: no client path may call
-- them directly, so direct execution is revoked from PUBLIC, anon and
-- authenticated. Trigger-internal invocation does not require EXECUTE and
-- remains unaffected by these revokes. No RLS is weakened or touched.
-- (Prior to this migration validate_participant_category() was executable
-- by PUBLIC by default; this migration closes that exposure.)
-------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.validate_participant_category() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_participant_category() FROM anon;
REVOKE ALL ON FUNCTION public.validate_participant_category() FROM authenticated;
REVOKE ALL ON FUNCTION public.validate_item_categories_for_template() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_item_categories_for_template() FROM anon;
REVOKE ALL ON FUNCTION public.validate_item_categories_for_template() FROM authenticated;
REVOKE ALL ON FUNCTION public.resolve_festival_template(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_festival_template(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.resolve_festival_template(uuid) FROM authenticated;

-------------------------------------------------------------------------------
-- 8. COMMENTS
-------------------------------------------------------------------------------
COMMENT ON FUNCTION public.resolve_festival_template(uuid) IS
  'Narrowly scoped SECURITY DEFINER resolver (Migration 103): returns the authoritative festival_calendar.festival_template for a festival id, independent of caller RLS. NULL input returns NULL; non-null unknown festivals and unexpected/null templates raise (fail closed). Direct execution revoked; trigger-internal use only.';

COMMENT ON FUNCTION public.validate_participant_category() IS
  'Template-aware participant category dispatcher (Migration 103). College Fest: manual-only canonical SUB_JUNIOR/JUNIOR/SENIOR; no JR/SR/GN; no DOB/class/education inference. Sahithyolsav: Migration 006 behavior preserved unchanged. Template resolved via resolve_festival_template (RLS-independent, fail closed). Trigger-internal only; direct execution revoked.';

COMMENT ON FUNCTION public.validate_item_categories_for_template() IS
  'College Fest item category enforcement (Migration 103): category_codes must be non-null, non-empty, one-dimensional, non-null/blank elements, canonical, duplicate-free. Sahithyolsav items pass through unchanged. Registration compatibility enforcement is deferred to Migration 104. Trigger-internal only; direct execution revoked.';

COMMENT ON TRIGGER trg_validate_item_categories_for_template ON public.items IS
  'Enforces College Fest canonical item categories on insert or when festival_id/category_codes change (Migration 103).';

COMMIT;

-- Reload PostgREST schema cache so the modified trigger function and the new
-- trigger are picked up immediately.
NOTIFY pgrst, 'reload schema';

-- END OF MIGRATION 103
