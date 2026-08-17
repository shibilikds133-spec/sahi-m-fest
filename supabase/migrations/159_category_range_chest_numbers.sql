-- Category-range chest numbers.
-- Every festival owns its range size. Existing festivals default to 100.
-- The public function replaces an entire festival atomically; it never mixes
-- an old and a new chest-number set.

BEGIN;

ALTER TABLE public.festival_calendar
  ADD COLUMN IF NOT EXISTS chest_number_category_range integer NOT NULL DEFAULT 100;

UPDATE public.festival_calendar
SET chest_number_category_range = 100
WHERE chest_number_category_range IS NULL
   OR chest_number_category_range NOT IN (100, 1000);

ALTER TABLE public.festival_calendar
  DROP CONSTRAINT IF EXISTS ck_festival_chest_number_category_range;
ALTER TABLE public.festival_calendar
  ADD CONSTRAINT ck_festival_chest_number_category_range
  CHECK (chest_number_category_range IN (100, 1000));

CREATE TABLE IF NOT EXISTS public.chest_number_regeneration_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  festival_id uuid NOT NULL REFERENCES public.festival_calendar(id) ON DELETE CASCADE,
  category_range integer NOT NULL CHECK (category_range IN (100, 1000)),
  participant_count integer NOT NULL,
  regenerated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  regenerated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chest_number_regeneration_audits_festival_idx
  ON public.chest_number_regeneration_audits (festival_id, regenerated_at DESC);

ALTER TABLE public.chest_number_regeneration_audits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chest_number_regeneration_audits_read ON public.chest_number_regeneration_audits;
CREATE POLICY chest_number_regeneration_audits_read
  ON public.chest_number_regeneration_audits FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id() OR public.is_superadmin());

CREATE OR REPLACE FUNCTION public.regenerate_festival_chest_numbers_internal(
  p_festival_id uuid,
  p_actor_id uuid DEFAULT NULL
)
RETURNS TABLE (participant_count integer, category_range integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
  v_range integer;
  v_missing_category_count integer;
  v_oversized_category text;
  v_participant_count integer;
BEGIN
  SELECT f.tenant_id, f.chest_number_category_range
    INTO v_tenant_id, v_range
  FROM public.festival_calendar f
  WHERE f.id = p_festival_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Festival not found.';
  END IF;

  SELECT count(*) INTO v_missing_category_count
  FROM public.participants p
  WHERE p.festival_id = p_festival_id
    AND (p.category_code IS NULL OR btrim(p.category_code) = '');
  IF v_missing_category_count > 0 THEN
    RAISE EXCEPTION 'Cannot regenerate: % participant(s) do not have a category.', v_missing_category_count;
  END IF;

  WITH category_counts AS (
    SELECT lower(btrim(p.category_code)) AS category_code, count(*) AS cat_count
    FROM public.participants p
    WHERE p.festival_id = p_festival_id
    GROUP BY lower(btrim(p.category_code))
  )
  SELECT category_code INTO v_oversized_category
  FROM category_counts
  WHERE cat_count > v_range
  ORDER BY category_code
  LIMIT 1;
  IF v_oversized_category IS NOT NULL THEN
    RAISE EXCEPTION 'Category % has more than % participants. Change the festival range to Under 1000 first.', v_oversized_category, v_range;
  END IF;

  DROP TABLE IF EXISTS chest_number_plan;
  CREATE TEMP TABLE chest_number_plan (
    participant_id uuid PRIMARY KEY,
    new_chest_number text NOT NULL UNIQUE
  ) ON COMMIT DROP;

  INSERT INTO chest_number_plan (participant_id, new_chest_number)
  WITH category_order AS (
    SELECT
      lower(btrim(p.category_code)) AS category_code,
      dense_rank() OVER (
        ORDER BY
          fc.sort_order NULLS LAST,
          lower(btrim(p.category_code))
      ) AS category_position
    FROM public.participants p
    LEFT JOIN public.festival_categories fc
      ON fc.festival_id = p_festival_id
     AND lower(fc.code) = lower(btrim(p.category_code))
    WHERE p.festival_id = p_festival_id
    GROUP BY p.category_code, fc.sort_order
  ), ranked_participants AS (
    SELECT
      p.id AS participant_id,
      co.category_position,
      row_number() OVER (
        PARTITION BY lower(btrim(p.category_code))
        ORDER BY
          NULLIF(regexp_replace(COALESCE(p.chest_number, ''), '[^0-9]', '', 'g'), '')::integer NULLS LAST,
          lower(p.name),
          p.id
      ) AS category_row
    FROM public.participants p
    JOIN category_order co ON co.category_code = lower(btrim(p.category_code))
    WHERE p.festival_id = p_festival_id
  )
  SELECT participant_id, ((category_position * v_range) + category_row - 1)::text
  FROM ranked_participants;

  -- Move old values out of the unique index namespace before applying final
  -- numeric values. The temporary values never leave this transaction.
  UPDATE public.participants p
  SET chest_number = '__regen__' || p.id::text
  WHERE p.festival_id = p_festival_id;

  UPDATE public.participants p
  SET chest_number = plan.new_chest_number
  FROM chest_number_plan plan
  WHERE p.id = plan.participant_id;

  GET DIAGNOSTICS v_participant_count = ROW_COUNT;

  INSERT INTO public.chest_number_regeneration_audits
    (tenant_id, festival_id, category_range, participant_count, regenerated_by)
  VALUES (v_tenant_id, p_festival_id, v_range, v_participant_count, p_actor_id);

  RETURN QUERY SELECT v_participant_count, v_range;
END;
$$;

REVOKE ALL ON FUNCTION public.regenerate_festival_chest_numbers_internal(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.regenerate_festival_chest_numbers(p_festival_id uuid)
RETURNS TABLE (participant_count integer, category_range integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_festival_tenant uuid;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
  SELECT tenant_id INTO v_festival_tenant FROM public.festival_calendar WHERE id = p_festival_id;

  IF NOT FOUND OR v_actor.id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.';
  END IF;
  IF v_actor.is_superadmin IS NOT TRUE
     AND (v_actor.role IS DISTINCT FROM 'admin' OR v_actor.tenant_id IS DISTINCT FROM v_festival_tenant) THEN
    RAISE EXCEPTION 'Only the owning tenant admin can regenerate chest numbers.';
  END IF;

  RETURN QUERY SELECT * FROM public.regenerate_festival_chest_numbers_internal(p_festival_id, v_actor.id);
END;
$$;

REVOKE ALL ON FUNCTION public.regenerate_festival_chest_numbers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regenerate_festival_chest_numbers(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_next_festival_chest_number(
  p_festival_id uuid,
  p_category_code text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_tenant_id uuid;
  v_range integer;
  v_category_position integer;
  v_next integer;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
  SELECT tenant_id, chest_number_category_range INTO v_tenant_id, v_range
  FROM public.festival_calendar WHERE id = p_festival_id;
  IF NOT FOUND OR v_actor.id IS NULL THEN RAISE EXCEPTION 'Festival not found or authentication is required.'; END IF;
  IF v_actor.is_superadmin IS NOT TRUE
     AND (v_actor.role IS DISTINCT FROM 'admin' OR v_actor.tenant_id IS DISTINCT FROM v_tenant_id) THEN
    RAISE EXCEPTION 'Only the owning tenant admin can generate chest numbers.';
  END IF;

  WITH codes AS (
    SELECT lower(btrim(code)) AS category_code
    FROM public.festival_categories
    WHERE festival_id = p_festival_id
    UNION
    SELECT DISTINCT lower(btrim(category_code)) AS category_code
    FROM public.participants WHERE festival_id = p_festival_id AND btrim(COALESCE(category_code, '')) <> ''
    UNION SELECT lower(btrim(p_category_code))
  ), ordered AS (
    SELECT category_code, row_number() OVER (
      ORDER BY fc.sort_order NULLS LAST,
      codes.category_code
    ) AS position
    FROM codes
    LEFT JOIN public.festival_categories fc
      ON fc.festival_id = p_festival_id
     AND lower(fc.code) = codes.category_code
  ) SELECT position INTO v_category_position FROM ordered WHERE category_code = lower(btrim(p_category_code));

  SELECT count(*) + 1 INTO v_next FROM public.participants
  WHERE festival_id = p_festival_id AND lower(btrim(category_code)) = lower(btrim(p_category_code));
  IF v_next > v_range THEN RAISE EXCEPTION 'Category capacity (%) reached. Change the festival range to Under 1000.', v_range; END IF;
  RETURN ((v_category_position * v_range) + v_next - 1)::text;
END;
$$;

REVOKE ALL ON FUNCTION public.get_next_festival_chest_number(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_next_festival_chest_number(uuid, text) TO authenticated;

-- User explicitly requested that every existing participant be migrated. This
-- executes once with the default Under 100 setting and rolls back entirely if
-- any festival exceeds its configured category capacity.
DO $$
DECLARE v_festival_id uuid;
BEGIN
  FOR v_festival_id IN SELECT id FROM public.festival_calendar LOOP
    PERFORM public.regenerate_festival_chest_numbers_internal(v_festival_id, NULL);
  END LOOP;
END;
$$;

COMMIT;
