-- Dual-mode mark entry:
--   criteria   = fully paperless, criterion-wise scoring
--   total_only = detailed scoring is kept on paper; only a total out of 100 is entered
--
-- This migration is intentionally additive. Existing mark values are not rewritten.

ALTER TABLE public.scoring_rules
  ADD COLUMN IF NOT EXISTS entry_mode text NOT NULL DEFAULT 'criteria';

ALTER TABLE public.scoring_rules
  DROP CONSTRAINT IF EXISTS scoring_rules_entry_mode_check;

ALTER TABLE public.scoring_rules
  ADD CONSTRAINT scoring_rules_entry_mode_check
  CHECK (entry_mode IN ('criteria', 'total_only'));

ALTER TABLE public.mark_entries
  ADD COLUMN IF NOT EXISTS entry_mode_snapshot text NOT NULL DEFAULT 'criteria',
  ADD COLUMN IF NOT EXISTS max_mark_snapshot numeric NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS criteria_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Preserve the exact legacy behaviour for historical marks. The old judge and
-- result screens treated every stored mark as being out of 100.
UPDATE public.mark_entries
SET
  entry_mode_snapshot = COALESCE(entry_mode_snapshot, 'criteria'),
  max_mark_snapshot = COALESCE(max_mark_snapshot, 100),
  criteria_snapshot = COALESCE(criteria_snapshot, '[]'::jsonb)
WHERE
  entry_mode_snapshot IS NULL
  OR max_mark_snapshot IS NULL
  OR criteria_snapshot IS NULL;

ALTER TABLE public.mark_entries
  DROP CONSTRAINT IF EXISTS mark_entries_entry_mode_snapshot_check,
  DROP CONSTRAINT IF EXISTS mark_entries_max_mark_snapshot_check,
  DROP CONSTRAINT IF EXISTS mark_entries_total_mark_range_check,
  DROP CONSTRAINT IF EXISTS mark_entries_criteria_snapshot_shape_check;

ALTER TABLE public.mark_entries
  ADD CONSTRAINT mark_entries_entry_mode_snapshot_check
    CHECK (entry_mode_snapshot IN ('criteria', 'total_only')),
  ADD CONSTRAINT mark_entries_max_mark_snapshot_check
    CHECK (max_mark_snapshot > 0),
  ADD CONSTRAINT mark_entries_total_mark_range_check
    CHECK (
      total_mark IS NULL
      OR (total_mark >= 0 AND total_mark <= max_mark_snapshot)
    ),
  ADD CONSTRAINT mark_entries_criteria_snapshot_shape_check
    CHECK (jsonb_typeof(criteria_snapshot) = 'array');

CREATE OR REPLACE FUNCTION public.validate_mark_entry_scoring()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  score_total numeric := 0;
  score_entry record;
  criterion jsonb;
  criterion_key text;
  criterion_max numeric;
  criterion_score numeric;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.is_final IS TRUE
     AND (
       NEW.criteria_scores IS DISTINCT FROM OLD.criteria_scores
       OR NEW.total_mark IS DISTINCT FROM OLD.total_mark
       OR NEW.entry_mode_snapshot IS DISTINCT FROM OLD.entry_mode_snapshot
       OR NEW.max_mark_snapshot IS DISTINCT FROM OLD.max_mark_snapshot
       OR NEW.criteria_snapshot IS DISTINCT FROM OLD.criteria_snapshot
     )
  THEN
    RAISE EXCEPTION 'Final marks cannot be modified.';
  END IF;

  IF NEW.entry_mode_snapshot = 'total_only' THEN
    IF NEW.max_mark_snapshot <> 100 THEN
      RAISE EXCEPTION 'Paper total mode must use a maximum mark of 100.';
    END IF;

    NEW.criteria_scores := COALESCE(NEW.criteria_scores, '{}'::jsonb);
    IF jsonb_typeof(NEW.criteria_scores) <> 'object' THEN
      RAISE EXCEPTION 'Criteria scores must be a JSON object.';
    END IF;

    RETURN NEW;
  END IF;

  NEW.criteria_scores := COALESCE(NEW.criteria_scores, '{}'::jsonb);
  IF jsonb_typeof(NEW.criteria_scores) <> 'object' THEN
    RAISE EXCEPTION 'Criteria scores must be a JSON object.';
  END IF;

  FOR score_entry IN SELECT key, value FROM jsonb_each(NEW.criteria_scores)
  LOOP
    IF jsonb_typeof(score_entry.value) <> 'number' THEN
      RAISE EXCEPTION 'Every criterion score must be numeric.';
    END IF;
    criterion_score := (score_entry.value #>> '{}')::numeric;
    IF criterion_score < 0 THEN
      RAISE EXCEPTION 'Criterion scores cannot be negative.';
    END IF;
    score_total := score_total + criterion_score;
  END LOOP;

  IF NEW.total_mark IS DISTINCT FROM score_total THEN
    RAISE EXCEPTION 'Total mark must equal the sum of criterion scores.';
  END IF;

  -- Old entries have no criterion snapshot. They remain readable and immutable.
  IF NEW.is_final IS TRUE AND jsonb_array_length(NEW.criteria_snapshot) > 0 THEN
    FOR criterion IN SELECT value FROM jsonb_array_elements(NEW.criteria_snapshot)
    LOOP
      criterion_key := criterion->>'key';
      criterion_max := (criterion->>'max')::numeric;

      IF criterion_key IS NULL OR criterion_key = '' OR criterion_max IS NULL OR criterion_max <= 0 THEN
        RAISE EXCEPTION 'Invalid scoring criterion snapshot.';
      END IF;
      IF NOT (NEW.criteria_scores ? criterion_key) THEN
        RAISE EXCEPTION 'A final mark is missing criterion %.', criterion_key;
      END IF;

      criterion_score := (NEW.criteria_scores->>criterion_key)::numeric;
      IF criterion_score > criterion_max THEN
        RAISE EXCEPTION 'Criterion % exceeds its maximum mark of %.', criterion_key, criterion_max;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_mark_entry_scoring_trigger
ON public.mark_entries;

CREATE TRIGGER validate_mark_entry_scoring_trigger
BEFORE INSERT OR UPDATE ON public.mark_entries
FOR EACH ROW
EXECUTE FUNCTION public.validate_mark_entry_scoring();

COMMENT ON COLUMN public.scoring_rules.entry_mode IS
  'criteria for paperless criterion-wise scoring; total_only for a single paper-derived total out of 100.';
COMMENT ON COLUMN public.mark_entries.entry_mode_snapshot IS
  'Scoring mode captured when the judge saved this mark.';
COMMENT ON COLUMN public.mark_entries.max_mark_snapshot IS
  'Maximum mark captured when the judge saved this mark.';
COMMENT ON COLUMN public.mark_entries.criteria_snapshot IS
  'Criterion keys, labels, and maxima captured when the judge saved this mark.';

NOTIFY pgrst, 'reload schema';
