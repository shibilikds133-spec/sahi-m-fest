-- Harden validation without changing or reinterpreting any stored mark.

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
  score_count integer := 0;
  criterion_count integer := 0;
  criterion_max_total numeric := 0;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.is_final IS TRUE
     AND (
       NEW.criteria_scores IS DISTINCT FROM OLD.criteria_scores
       OR NEW.total_mark IS DISTINCT FROM OLD.total_mark
       OR NEW.entry_mode_snapshot IS DISTINCT FROM OLD.entry_mode_snapshot
       OR NEW.max_mark_snapshot IS DISTINCT FROM OLD.max_mark_snapshot
       OR NEW.criteria_snapshot IS DISTINCT FROM OLD.criteria_snapshot
       OR NEW.is_final IS DISTINCT FROM OLD.is_final
       OR NEW.is_draft IS DISTINCT FROM OLD.is_draft
       OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
     )
  THEN
    RAISE EXCEPTION 'Final marks cannot be modified or reopened.';
  END IF;

  IF NEW.is_final IS TRUE AND NEW.total_mark IS NULL THEN
    RAISE EXCEPTION 'A final mark requires a total.';
  END IF;

  IF NEW.entry_mode_snapshot = 'total_only' THEN
    IF NEW.max_mark_snapshot <> 100 THEN
      RAISE EXCEPTION 'Paper total mode must use a maximum mark of 100.';
    END IF;

    NEW.criteria_scores := COALESCE(NEW.criteria_scores, '{}'::jsonb);
    IF jsonb_typeof(NEW.criteria_scores) <> 'object'
       OR NEW.criteria_scores <> '{}'::jsonb
    THEN
      RAISE EXCEPTION 'Paper total mode cannot contain criterion scores.';
    END IF;

    RETURN NEW;
  END IF;

  NEW.criteria_scores := COALESCE(NEW.criteria_scores, '{}'::jsonb);
  IF jsonb_typeof(NEW.criteria_scores) <> 'object' THEN
    RAISE EXCEPTION 'Criteria scores must be a JSON object.';
  END IF;

  FOR score_entry IN SELECT key, value FROM jsonb_each(NEW.criteria_scores)
  LOOP
    score_count := score_count + 1;
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

  -- Legacy entries intentionally have an empty snapshot. New clients provide
  -- a snapshot, which enables complete server-side validation.
  IF jsonb_array_length(NEW.criteria_snapshot) > 0 THEN
    FOR criterion IN SELECT value FROM jsonb_array_elements(NEW.criteria_snapshot)
    LOOP
      criterion_count := criterion_count + 1;
      criterion_key := criterion->>'key';
      criterion_max := (criterion->>'max')::numeric;
      criterion_max_total := criterion_max_total + COALESCE(criterion_max, 0);

      IF criterion_key IS NULL OR criterion_key = '' OR criterion_max IS NULL OR criterion_max <= 0 THEN
        RAISE EXCEPTION 'Invalid scoring criterion snapshot.';
      END IF;

      IF NEW.criteria_scores ? criterion_key THEN
        criterion_score := (NEW.criteria_scores->>criterion_key)::numeric;
        IF criterion_score > criterion_max THEN
          RAISE EXCEPTION 'Criterion % exceeds its maximum mark of %.', criterion_key, criterion_max;
        END IF;
      ELSIF NEW.is_final IS TRUE THEN
        RAISE EXCEPTION 'A final mark is missing criterion %.', criterion_key;
      END IF;
    END LOOP;

    IF criterion_max_total <> NEW.max_mark_snapshot THEN
      RAISE EXCEPTION 'Criterion maxima must equal the saved maximum mark.';
    END IF;
    IF score_count > criterion_count THEN
      RAISE EXCEPTION 'Criteria scores contain an unknown criterion.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
