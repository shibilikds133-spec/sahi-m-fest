-- 108_relax_participant_category_code_constraint.sql
-- Replace the historical fixed allow-list with structural validation only.
-- Template-aware trigger validation remains the authority for category meaning.

BEGIN;

DO $$
DECLARE
  v_constraint_count integer;
  v_invalid_count integer;
BEGIN
  SELECT count(*) INTO v_constraint_count
  FROM pg_catalog.pg_constraint c
  JOIN pg_catalog.pg_class r ON r.oid = c.conrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = r.relnamespace
  WHERE n.nspname = 'public'
    AND r.relname = 'participants'
    AND c.conname = 'chk_category_code';

  IF v_constraint_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one public.participants.chk_category_code; found %', v_constraint_count;
  END IF;

  -- Preserve existing rows and fail closed if any value cannot satisfy the
  -- replacement structural contract. NULL remains permitted as before.
  SELECT count(*) INTO v_invalid_count
  FROM public.participants
  WHERE category_code IS NOT NULL
    AND (btrim(category_code) = '' OR category_code !~ '^[A-Za-z][A-Za-z0-9_]*$');

  IF v_invalid_count <> 0 THEN
    RAISE EXCEPTION 'Existing participants contain % category_code value(s) incompatible with the replacement structural constraint. No data was modified.', v_invalid_count;
  END IF;
END;
$$;

ALTER TABLE public.participants DROP CONSTRAINT chk_category_code;

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
  'Structural category-code validation only. Festival-template validators enforce Sahithyolsav fixed rules and College Fest category ownership, festival membership, and active-state rules.';

COMMIT;
NOTIFY pgrst, 'reload schema';
