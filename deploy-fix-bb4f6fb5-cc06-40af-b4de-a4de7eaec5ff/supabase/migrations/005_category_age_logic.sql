-- ============================================================
-- Migration 005: Category Assignment Logic (DB-level)
-- Sahityotsav Niyamavali 2025 Rules
-- Cutoff date: 31 May 2025
-- ============================================================

-- 1. Add dob column if not exists
ALTER TABLE participants ADD COLUMN IF NOT EXISTS dob date;

-- 2. Add education_type column if not exists
ALTER TABLE participants ADD COLUMN IF NOT EXISTS education_type text;

-- 3. DB function: calculate age as of 31 May 2025
CREATE OR REPLACE FUNCTION ssf_calculate_age(p_dob date)
RETURNS int AS $$
DECLARE
  cutoff date := '2025-05-31';
  age int;
BEGIN
  age := date_part('year', age(cutoff, p_dob));
  RETURN age;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 4. DB function: determine category based on Niyamavali rules
CREATE OR REPLACE FUNCTION ssf_get_category(
  p_dob date,
  p_class_std int DEFAULT NULL,
  p_education_type text DEFAULT NULL
)
RETURNS text AS $$
DECLARE
  age int;
  edu text;
BEGIN
  edu := lower(trim(coalesce(p_education_type, '')));

  -- Priority 1: CAMPUS (CA)
  IF edu IN ('degree', 'pg', 'iti', 'polytechnic', 'poly', 'd.ed', 'ded', 'b.ed', 'bed') THEN
    RETURN 'CA';
  END IF;

  -- Priority 2 & 3: Age-based (requires DOB)
  IF p_dob IS NOT NULL THEN
    age := ssf_calculate_age(p_dob);

    IF age >= 15 AND age <= 20 THEN RETURN 'JR'; END IF;
    IF age >= 21 AND age <= 25 THEN RETURN 'SR'; END IF;
  END IF;

  -- Priority 4: Class-based fallback
  IF p_class_std IS NOT NULL THEN
    IF p_class_std BETWEEN 1  AND 4  THEN RETURN 'LP';  END IF;
    IF p_class_std BETWEEN 5  AND 7  THEN RETURN 'UP';  END IF;
    IF p_class_std BETWEEN 8  AND 10 THEN RETURN 'HS';  END IF;
    IF p_class_std BETWEEN 11 AND 12 THEN RETURN 'HSS'; END IF;
  END IF;

  RETURN NULL; -- Could not determine
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 5. DB-level validation trigger function
CREATE OR REPLACE FUNCTION validate_participant_category()
RETURNS trigger AS $$
DECLARE
  expected_cat text;
  age int;
BEGIN
  -- Only validate if dob or education_type is provided
  IF NEW.dob IS NOT NULL OR NEW.education_type IS NOT NULL THEN
    expected_cat := ssf_get_category(NEW.dob, NEW.class_std::int, NEW.education_type);

    IF expected_cat IS NOT NULL AND expected_cat != NEW.category_code THEN
      RAISE EXCEPTION 'Category mismatch. Expected: %, Got: %. Check DOB, class, and education type.',
        expected_cat, NEW.category_code;
    END IF;
  END IF;

  -- DOB range validation for JUNIOR
  IF NEW.category_code = 'JR' AND NEW.dob IS NOT NULL THEN
    IF NEW.dob <= '2005-05-31' THEN
      RAISE EXCEPTION 'JUNIOR (JR) category: DOB must be after 31 May 2005.';
    END IF;
  END IF;

  -- DOB range validation for SENIOR
  IF NEW.category_code = 'SR' AND NEW.dob IS NOT NULL THEN
    IF NEW.dob <= '2000-05-31' THEN
      RAISE EXCEPTION 'SENIOR (SR) category: DOB must be after 31 May 2000.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Attach trigger to participants table
DROP TRIGGER IF EXISTS trg_validate_participant_category ON participants;
CREATE TRIGGER trg_validate_participant_category
  BEFORE INSERT OR UPDATE ON participants
  FOR EACH ROW EXECUTE FUNCTION validate_participant_category();

-- 7. Reload schema cache
SELECT pg_notify('pgrst', 'reload schema');
