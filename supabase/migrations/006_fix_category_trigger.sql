-- Migration 006: Fix Category Logic and Trigger to match Typescript
-- Priority: CAMPUS -> Class-based -> Age-based
-- Cutoff year updated to 2026

-- 1. Update DB function: calculate age dynamically
CREATE OR REPLACE FUNCTION ssf_calculate_age(p_dob date, p_festival_year int DEFAULT 2026)
RETURNS int AS $$
DECLARE
  cutoff date := make_date(p_festival_year, 5, 31);
  age int;
BEGIN
  age := date_part('year', age(cutoff, p_dob));
  RETURN age;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. Update DB function: determine category based on updated TS rules
CREATE OR REPLACE FUNCTION ssf_get_category(
  p_dob date,
  p_class_std int DEFAULT NULL,
  p_education_type text DEFAULT NULL,
  p_festival_year int DEFAULT 2026
)
RETURNS text AS $$
DECLARE
  edu text;
  junior_limit date;
  senior_limit date;
  young_limit date;
BEGIN
  edu := lower(trim(coalesce(p_education_type, '')));

  -- Priority 1: CAMPUS (Degree/PG overrides everything else)
  IF edu IN ('degree', 'pg', 'iti', 'polytechnic', 'poly', 'd.ed', 'ded', 'b.ed', 'bed') THEN
    RETURN 'CAMPUS';
  END IF;

  -- Priority 2: Class-based fallback (School students get class level even if age falls in Junior/Senior)
  IF p_class_std IS NOT NULL THEN
    IF p_class_std BETWEEN 1  AND 4  THEN RETURN 'LP';  END IF;
    IF p_class_std BETWEEN 5  AND 7  THEN RETURN 'UP';  END IF;
    IF p_class_std BETWEEN 8  AND 10 THEN RETURN 'HS';  END IF;
    IF p_class_std BETWEEN 11 AND 12 THEN RETURN 'HSS'; END IF;
  END IF;

  -- Priority 3: Age-based JUNIOR / SENIOR (Only if no class/campus)
  IF p_dob IS NOT NULL THEN
    junior_limit := make_date(p_festival_year - 20, 5, 31);
    senior_limit := make_date(p_festival_year - 26, 5, 31);
    young_limit := make_date(p_festival_year - 15, 5, 31);

    -- SENIOR first (age 20–25)
    IF p_dob > senior_limit AND p_dob <= junior_limit THEN
      RETURN 'SENIOR';
    END IF;

    -- JUNIOR (age 15–19)
    IF p_dob > junior_limit AND p_dob <= young_limit THEN
      RETURN 'JUNIOR';
    END IF;
  END IF;

  RETURN NULL; -- Could not determine
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 3. Update DB-level validation trigger function
CREATE OR REPLACE FUNCTION validate_participant_category()
RETURNS trigger AS $$
DECLARE
  expected_cat text;
  p_festival_year int := 2026;
  junior_limit date := make_date(p_festival_year - 20, 5, 31);
  senior_limit date := make_date(p_festival_year - 26, 5, 31);
BEGIN
  -- Only validate if dob or education_type or class_std is provided
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
$$ LANGUAGE plpgsql;

-- 4. Reload schema cache
NOTIFY pgrst, 'reload schema';
