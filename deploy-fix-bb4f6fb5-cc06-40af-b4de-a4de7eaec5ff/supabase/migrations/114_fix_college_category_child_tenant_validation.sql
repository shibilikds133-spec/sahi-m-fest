-- College Fest categories belong to the festival tenant. Participants may
-- belong to a child organisation tenant, so validation must not require the
-- participant tenant_id to equal the category tenant_id.

BEGIN;

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
  IF NEW.festival_id IS NOT NULL THEN
    v_template := public.resolve_festival_template(NEW.festival_id);
  END IF;

  IF v_template = 'college_fest' THEN
    IF NEW.category_code IS NULL OR btrim(NEW.category_code) = '' THEN
      RAISE EXCEPTION 'College Fest participants require a category.';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.festival_categories c
      WHERE c.festival_id = NEW.festival_id
        AND c.code = NEW.category_code
        AND (
          c.is_active
          OR (TG_OP = 'UPDATE'
              AND NEW.category_code IS NOT DISTINCT FROM OLD.category_code
              AND NEW.festival_id IS NOT DISTINCT FROM OLD.festival_id)
        )
    ) THEN
      RAISE EXCEPTION 'Selected College Fest category is invalid, archived, or belongs to another festival.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.dob IS NOT NULL OR NEW.education_type IS NOT NULL OR NEW.class_std IS NOT NULL THEN
    expected_cat := ssf_get_category(NEW.dob, NEW.class_std::int, NEW.education_type, p_festival_year);
    IF expected_cat IS NOT NULL AND expected_cat != NEW.category_code THEN
      RAISE EXCEPTION 'Category mismatch. Expected: %, Got: %. Check DOB, class, and education type.', expected_cat, NEW.category_code;
    END IF;
  END IF;
  IF NEW.category_code = 'JUNIOR' AND NEW.dob IS NOT NULL AND NEW.dob <= junior_limit THEN
    RAISE EXCEPTION 'JUNIOR category: DOB must be after %', junior_limit;
  END IF;
  IF NEW.category_code = 'SENIOR' AND NEW.dob IS NOT NULL AND NEW.dob <= senior_limit THEN
    RAISE EXCEPTION 'SENIOR category: DOB must be after %', senior_limit;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_participant_category() IS
  'Validates College Fest categories by festival membership; participant child-tenant ownership is allowed.';

COMMIT;
NOTIFY pgrst, 'reload schema';
