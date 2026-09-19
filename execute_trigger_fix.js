const { Client } = require("pg");

const sql = `
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
  -- Allow unlocking marks: if is_final is being changed from true to false, we allow it.
  -- Otherwise, if is_final remains true, prevent modifications to the protected fields.
  IF TG_OP = 'UPDATE'
     AND OLD.is_final IS TRUE
     AND NEW.is_final IS TRUE -- ONLY block if it is REMAINING final
     AND (
       NEW.criteria_scores IS DISTINCT FROM OLD.criteria_scores
       OR NEW.total_mark IS DISTINCT FROM OLD.total_mark
       OR NEW.entry_mode_snapshot IS DISTINCT FROM OLD.entry_mode_snapshot
       OR NEW.max_mark_snapshot IS DISTINCT FROM OLD.max_mark_snapshot
       OR NEW.criteria_snapshot IS DISTINCT FROM OLD.criteria_snapshot
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
    IF jsonb_typeof(NEW.criteria_scores) <> 'object' THEN
      RAISE EXCEPTION 'criteria_scores must be a JSON object.';
    END IF;

    IF NEW.total_mark < 0 OR NEW.total_mark > NEW.max_mark_snapshot THEN
      RAISE EXCEPTION 'Total mark % exceeds allowed range (0 - %).', NEW.total_mark, NEW.max_mark_snapshot;
    END IF;

    RETURN NEW;
  END IF;

  IF jsonb_typeof(NEW.criteria_snapshot) <> 'array' THEN
    RAISE EXCEPTION 'criteria_snapshot must be a JSON array in criteria mode.';
  END IF;

  IF NEW.criteria_scores IS NULL OR jsonb_typeof(NEW.criteria_scores) <> 'object' THEN
    RAISE EXCEPTION 'criteria_scores must be a JSON object in criteria mode.';
  END IF;

  FOR criterion IN SELECT * FROM jsonb_array_elements(NEW.criteria_snapshot) LOOP
    criterion_key := criterion->>'id';
    criterion_max := (criterion->>'max_score')::numeric;
    criterion_count := criterion_count + 1;
    criterion_max_total := criterion_max_total + criterion_max;

    IF NEW.criteria_scores ? criterion_key THEN
      criterion_score := (NEW.criteria_scores->>criterion_key)::numeric;
      IF criterion_score < 0 OR criterion_score > criterion_max THEN
        RAISE EXCEPTION 'Score % for criterion % exceeds maximum %.', criterion_score, criterion_key, criterion_max;
      END IF;
      score_total := score_total + criterion_score;
      score_count := score_count + 1;
    END IF;
  END LOOP;

  IF NEW.is_final IS TRUE AND score_count <> criterion_count THEN
    RAISE EXCEPTION 'A final mark requires all % criteria to be scored (only % provided).', criterion_count, score_count;
  END IF;

  IF NEW.total_mark IS DISTINCT FROM score_total THEN
    RAISE EXCEPTION 'Provided total mark % does not match the sum of criteria scores %.', NEW.total_mark, score_total;
  END IF;

  IF NEW.max_mark_snapshot IS DISTINCT FROM criterion_max_total THEN
    RAISE EXCEPTION 'Provided max_mark_snapshot % does not match the sum of criteria max scores %.', NEW.max_mark_snapshot, criterion_max_total;
  END IF;

  RETURN NEW;
END;
$$;
`;

async function run() {
  const client = new Client({
    connectionString: "postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres"
  });

  try {
    await client.connect();
    console.log("Connected to DB.");
    await client.query(sql);
    console.log("Trigger function updated successfully!");
  } catch (err) {
    console.error("Error executing SQL:", err);
  } finally {
    await client.end();
  }
}

run();
