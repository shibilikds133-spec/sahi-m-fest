-- Migration 158: archived categories cannot be added to new items, while
-- existing item history remains editable without forcing a data rewrite.
--
-- INSERT: every category must be active.
-- UPDATE: a category that was already present on the item may remain archived;
--         adding a newly archived category is rejected.
-- Existing registrations, schedules, marks and results are not changed.

BEGIN;

CREATE OR REPLACE FUNCTION public.validate_item_categories_for_template()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
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
      -- Preserve an already-used archived category on an existing item. It
      -- cannot be introduced to a new item or added during an edit.
      IF TG_OP <> 'UPDATE' OR NOT EXISTS (
        SELECT 1
        FROM unnest(COALESCE(OLD.category_codes, ARRAY[]::text[])) AS old_code
        WHERE lower(btrim(old_code)) = lower(btrim(v_elem))
      ) THEN
        RAISE EXCEPTION 'College Fest item category % is invalid, archived, or belongs to another festival.', v_elem;
      END IF;
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

ALTER FUNCTION public.validate_item_categories_for_template() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.validate_item_categories_for_template()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.validate_item_categories_for_template() IS
  'College Fest item categories must be active when introduced. Existing archived category references remain valid on updates so historical item data is not broken.';

COMMIT;

NOTIFY pgrst, 'reload schema';
