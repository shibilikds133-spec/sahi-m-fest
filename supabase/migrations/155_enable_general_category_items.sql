-- Migration 155: make General (GN) a first-class open item category.
--
-- General is an item category, not a participant age/category bucket.
-- It is created explicitly from Festival Settings and is disabled by default.
-- Existing registrations, marks, schedules and results are preserved.

BEGIN;

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
  IF NEW.festival_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_template := public.resolve_festival_template(NEW.festival_id);
  IF v_template <> 'college_fest' THEN
    RETURN NEW;
  END IF;

  IF NEW.category_codes IS NULL OR cardinality(NEW.category_codes) = 0 THEN
    RAISE EXCEPTION 'College Fest items require at least one active category.';
  END IF;
  IF array_ndims(NEW.category_codes) <> 1 THEN
    RAISE EXCEPTION 'College Fest item category_codes must be a one-dimensional array.';
  END IF;

  FOREACH v_elem IN ARRAY NEW.category_codes LOOP
    IF v_elem IS NULL OR btrim(v_elem) = '' THEN
      RAISE EXCEPTION 'College Fest item category_codes contains a null or blank value.';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.festival_categories c
      WHERE c.festival_id = NEW.festival_id
        AND c.tenant_id = NEW.tenant_id
        AND c.is_active
        AND lower(btrim(c.code)) = lower(btrim(v_elem))
    ) THEN
      RAISE EXCEPTION 'College Fest item category % is invalid, archived, or belongs to another festival.', v_elem;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_dup_count
  FROM (
    SELECT upper(btrim(x))
    FROM unnest(NEW.category_codes) AS x
    GROUP BY upper(btrim(x))
    HAVING count(*) > 1
  ) dup;
  IF v_dup_count > 0 THEN
    RAISE EXCEPTION 'College Fest item category_codes contains duplicate categories.';
  END IF;

  RETURN NEW;
END;
$$;

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
  IF NEW.festival_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_template := public.resolve_festival_template(NEW.festival_id);
  IF v_template <> 'college_fest' THEN
    RETURN NEW;
  END IF;
  IF NEW.participant_id IS NULL OR NEW.item_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_participant_category := public.resolve_participant_category(NEW.participant_id);
  v_item_categories := public.resolve_item_categories(NEW.item_id);

  IF v_item_categories IS NULL OR cardinality(v_item_categories) = 0 THEN
    RAISE EXCEPTION 'College Fest item % has no categories; registration is not allowed.', NEW.item_id;
  END IF;

  -- GN is the open category: it accepts every existing participant bucket.
  IF EXISTS (
    SELECT 1 FROM unnest(v_item_categories) AS category_code
    WHERE upper(btrim(category_code)) = 'GN'
  ) THEN
    RETURN NEW;
  END IF;

  IF v_participant_category IS NULL OR NOT EXISTS (
    SELECT 1
    FROM unnest(v_item_categories) AS category_code
    WHERE upper(btrim(category_code)) = upper(btrim(v_participant_category))
  ) THEN
    RAISE EXCEPTION 'College Fest registration: participant category % does not match item % categories (%).',
      v_participant_category, NEW.item_id, array_to_string(v_item_categories, ', ');
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_item_categories_for_template() IS
  'College Fest item categories must reference active festival categories. GN, when explicitly created and enabled, is an open item category; existing registration and result history is preserved.';

COMMENT ON FUNCTION public.validate_registration_category_compatibility() IS
  'College Fest registration compatibility: GN item categories accept every participant category; other items require an exact category match.';

REVOKE ALL ON FUNCTION public.validate_item_categories_for_template() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_registration_category_compatibility() FROM PUBLIC, anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
