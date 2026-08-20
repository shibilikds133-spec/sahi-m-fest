-- Ensure the legacy fixed College Fest category constraint cannot reject
-- festival_categories.code values. The template-aware trigger remains the
-- authority for whether a code belongs to the selected festival.

BEGIN;

ALTER TABLE public.participants
  DROP CONSTRAINT IF EXISTS chk_category_code;

ALTER TABLE public.participants
  ADD CONSTRAINT chk_category_code
  CHECK (
    category_code IS NULL
    OR (
      btrim(category_code) = category_code
      AND category_code ~ '^[A-Za-z][A-Za-z0-9_]*$'
    )
  );

COMMENT ON CONSTRAINT chk_category_code ON public.participants IS
  'Structural category-code validation only. Festival-template validators enforce category ownership and festival membership.';

COMMIT;
NOTIFY pgrst, 'reload schema';
