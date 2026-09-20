-- Migration: fix_general_category_registration
-- Make General (GN or GENERAL) a valid open category for College Fest item assignment

BEGIN;

CREATE OR REPLACE FUNCTION public.validate_registration_category_compatibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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

  -- GN/GENERAL is the open category: it accepts every existing participant bucket.
  IF EXISTS (
    SELECT 1 FROM unnest(v_item_categories) AS category_code
    WHERE upper(btrim(category_code)) = 'GN' OR upper(btrim(category_code)) = 'GENERAL'
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

COMMIT;

NOTIFY pgrst, 'reload schema';
