-- 106_college_fest_custom_categories.sql
-- Forward-only College Fest custom category storage and enforcement.

BEGIN;

CREATE TABLE public.festival_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  festival_id uuid NOT NULL REFERENCES public.festival_calendar(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (btrim(name) <> ''),
  code text NOT NULL CHECK (code ~ '^[a-z][a-z0-9_]*$'),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT festival_categories_code_unique UNIQUE (festival_id, code),
  CONSTRAINT festival_categories_active_state CHECK (
    (is_active AND archived_at IS NULL) OR (NOT is_active AND archived_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX festival_categories_active_name_unique
  ON public.festival_categories (festival_id, lower(btrim(name)))
  WHERE is_active;
CREATE INDEX festival_categories_list_idx
  ON public.festival_categories (tenant_id, festival_id, is_active, sort_order, name);

ALTER TABLE public.festival_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY festival_categories_select_tenant
  ON public.festival_categories FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id() OR public.is_superadmin());

CREATE POLICY festival_categories_insert_admin
  ON public.festival_categories FOR INSERT TO authenticated
  WITH CHECK (
    (tenant_id = public.get_my_tenant_id() AND EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    ))
    OR public.is_superadmin()
  );

CREATE POLICY festival_categories_update_admin
  ON public.festival_categories FOR UPDATE TO authenticated
  USING (
    (tenant_id = public.get_my_tenant_id() AND EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    ))
    OR public.is_superadmin()
  )
  WITH CHECK (
    (tenant_id = public.get_my_tenant_id() AND EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    ))
    OR public.is_superadmin()
  );

REVOKE ALL ON TABLE public.festival_categories FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.festival_categories TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_festival_category_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_festival_tenant uuid;
  v_template text;
BEGIN
  SELECT tenant_id, festival_template
  INTO v_festival_tenant, v_template
  FROM public.festival_calendar
  WHERE id = NEW.festival_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Festival not found.';
  END IF;
  IF v_template <> 'college_fest' THEN
    RAISE EXCEPTION 'Custom categories are available only for College Fest festivals.';
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM v_festival_tenant THEN
    RAISE EXCEPTION 'Category tenant does not match the selected festival.';
  END IF;

  NEW.name := btrim(NEW.name);
  NEW.code := lower(btrim(NEW.code));
  NEW.updated_at := now();
  IF NEW.is_active THEN
    NEW.archived_at := NULL;
  ELSIF NEW.archived_at IS NULL THEN
    NEW.archived_at := now();
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.festival_id IS DISTINCT FROM OLD.festival_id THEN
      RAISE EXCEPTION 'A category cannot be moved to another tenant or festival.';
    END IF;
    IF NEW.code IS DISTINCT FROM OLD.code AND (
      EXISTS (SELECT 1 FROM public.participants p
              WHERE p.festival_id = OLD.festival_id AND p.category_code = OLD.code)
      OR EXISTS (SELECT 1 FROM public.items i
                 WHERE i.festival_id = OLD.festival_id AND OLD.code = ANY(i.category_codes))
    ) THEN
      RAISE EXCEPTION 'Category code cannot be changed after it has been used.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_festival_category_row
  BEFORE INSERT OR UPDATE ON public.festival_categories
  FOR EACH ROW EXECUTE FUNCTION public.validate_festival_category_row();

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
      SELECT 1 FROM public.festival_categories c
      WHERE c.festival_id = NEW.festival_id
        AND c.tenant_id = NEW.tenant_id
        AND c.code = NEW.category_code
        AND (
          c.is_active
          OR (TG_OP = 'UPDATE'
              AND NEW.category_code IS NOT DISTINCT FROM OLD.category_code
              AND NEW.festival_id IS NOT DISTINCT FROM OLD.festival_id
              AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id)
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

CREATE OR REPLACE FUNCTION public.validate_item_categories_for_template()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_template text;
  v_elem text;
BEGIN
  IF NEW.festival_id IS NULL THEN RETURN NEW; END IF;
  v_template := public.resolve_festival_template(NEW.festival_id);
  IF v_template <> 'college_fest' THEN RETURN NEW; END IF;
  IF NEW.category_codes IS NULL OR cardinality(NEW.category_codes) = 0 THEN
    RAISE EXCEPTION 'College Fest items require at least one category.';
  END IF;
  IF array_ndims(NEW.category_codes) <> 1 THEN
    RAISE EXCEPTION 'College Fest item categories must be a one-dimensional array.';
  END IF;
  IF cardinality(NEW.category_codes) <> (SELECT count(DISTINCT x) FROM unnest(NEW.category_codes) x) THEN
    RAISE EXCEPTION 'College Fest item categories contain duplicates.';
  END IF;
  FOREACH v_elem IN ARRAY NEW.category_codes LOOP
    IF v_elem IS NULL OR btrim(v_elem) = '' OR NOT EXISTS (
      SELECT 1 FROM public.festival_categories c
      WHERE c.festival_id = NEW.festival_id
        AND c.tenant_id = NEW.tenant_id
        AND c.code = v_elem
        AND c.is_active
    ) THEN
      RAISE EXCEPTION 'College Fest item category % is invalid, archived, or belongs to another festival.', v_elem;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_festival_category_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_participant_category() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_item_categories_for_template() FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.festival_categories IS
  'Festival-scoped manual categories for College Fest. Codes remain stable; referenced categories are archived.';

COMMIT;
NOTIFY pgrst, 'reload schema';
