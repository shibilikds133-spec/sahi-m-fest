-- Create a participant and allocate its chest number in one transaction.
-- Existing chest-number formats and category/range ordering are preserved.
-- The advisory transaction lock serializes this RPC per festival; the unique
-- index remains the final guard for rows inserted by other client paths.

CREATE OR REPLACE FUNCTION public.create_participant_with_chest_number(
  p_tenant_id uuid,
  p_festival_id uuid,
  p_organisation_id uuid,
  p_name text,
  p_category_code text,
  p_status text,
  p_age integer,
  p_class_std text,
  p_dob date,
  p_gender text,
  p_public_profile_enabled boolean,
  p_show_organisation_public boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_festival_tenant uuid;
  v_organisation_tenant uuid;
  v_range integer;
  v_category_position integer;
  v_ordinal integer;
  v_candidate text;
  v_constraint_name text;
  v_participant public.participants%ROWTYPE;
BEGIN
  IF p_festival_id IS NULL OR p_category_code IS NULL OR btrim(p_category_code) = '' THEN
    RAISE EXCEPTION 'Festival and category are required to create a participant.';
  END IF;

  SELECT * INTO v_actor
  FROM public.profiles
  WHERE id = auth.uid();

  SELECT tenant_id, COALESCE(chest_number_category_range, 100)
    INTO v_festival_tenant, v_range
  FROM public.festival_calendar
  WHERE id = p_festival_id;

  IF NOT FOUND OR v_actor.id IS NULL THEN
    RAISE EXCEPTION 'Festival not found or authentication is required.';
  END IF;

  IF v_actor.is_superadmin IS NOT TRUE
     AND (v_actor.role IS DISTINCT FROM 'admin'
       OR v_actor.tenant_id IS DISTINCT FROM v_festival_tenant) THEN
    RAISE EXCEPTION 'Only the owning tenant admin can create participants.';
  END IF;

  SELECT tenant_id INTO v_organisation_tenant
  FROM public.organisations
  WHERE id = p_organisation_id;

  IF NOT FOUND OR v_organisation_tenant IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'Participant organisation does not match its tenant.';
  END IF;

  IF v_actor.is_superadmin IS NOT TRUE
     AND NOT public.is_org_visible(p_organisation_id) THEN
    RAISE EXCEPTION 'You cannot create participants in this organisation.';
  END IF;

  -- This is transaction-scoped, so the lock is released on success or error.
  PERFORM pg_advisory_xact_lock(hashtext(p_festival_id::text), hashtext('participant-chest-number'));

  WITH category_codes AS (
    SELECT lower(btrim(fc.code)) AS category_code
    FROM public.festival_categories fc
    WHERE fc.festival_id = p_festival_id
      AND btrim(COALESCE(fc.code, '')) <> ''
    UNION
    SELECT DISTINCT lower(btrim(p.category_code))
    FROM public.participants p
    WHERE p.festival_id = p_festival_id
      AND btrim(COALESCE(p.category_code, '')) <> ''
    UNION
    SELECT lower(btrim(p_category_code))
  ), ordered_categories AS (
    SELECT codes.category_code,
           row_number() OVER (ORDER BY fc.sort_order NULLS LAST, codes.category_code) AS position
    FROM category_codes codes
    LEFT JOIN LATERAL (
      SELECT min(fc.sort_order) AS sort_order
      FROM public.festival_categories fc
      WHERE fc.festival_id = p_festival_id
        AND lower(btrim(fc.code)) = codes.category_code
    ) fc ON true
  )
  SELECT position INTO v_category_position
  FROM ordered_categories
  WHERE category_code = lower(btrim(p_category_code));

  IF v_category_position IS NULL THEN
    RAISE EXCEPTION 'Unable to resolve the participant category position.';
  END IF;

  -- Search this category's existing numeric block. Starting at its first slot
  -- also handles holes left by deletions or earlier imports without reusing an
  -- occupied number. The insert itself remains the authoritative uniqueness test.
  FOR v_ordinal IN 1..v_range LOOP
    v_candidate := ((v_category_position * v_range) + v_ordinal - 1)::text;

    BEGIN
      INSERT INTO public.participants (
        tenant_id,
        festival_id,
        organisation_id,
        name,
        category_code,
        chest_number,
        status,
        age,
        class_std,
        dob,
        gender,
        public_profile_enabled,
        show_organisation_public
      ) VALUES (
        p_tenant_id,
        p_festival_id,
        p_organisation_id,
        p_name,
        p_category_code,
        v_candidate,
        p_status,
        p_age,
        p_class_std,
        p_dob,
        p_gender,
        p_public_profile_enabled,
        p_show_organisation_public
      )
      RETURNING * INTO v_participant;

      RETURN to_jsonb(v_participant);
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
      IF v_constraint_name IS DISTINCT FROM 'unique_active_chest_number' THEN
        RAISE;
      END IF;
      -- A concurrent legacy/direct insert may have taken the candidate; try
      -- the next configured slot while still holding this transaction's lock.
    END;
  END LOOP;

  RAISE EXCEPTION 'Category capacity (%) reached. Change the festival range to Under 1000.', v_range;
END;
$$;

REVOKE ALL ON FUNCTION public.create_participant_with_chest_number(
  uuid, uuid, uuid, text, text, text, integer, text, date, text, boolean, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_participant_with_chest_number(
  uuid, uuid, uuid, text, text, text, integer, text, date, text, boolean, boolean
) TO authenticated;

NOTIFY pgrst, 'reload schema';
