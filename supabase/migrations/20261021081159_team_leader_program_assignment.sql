-- Team Leaders may assign existing students in their active team to
-- individual programs and create General group entries. Student creation and
-- every other group-entry flow remain administrator-managed.

BEGIN;

-- This staging branch has the General category controls but not the shared
-- General entry identity fields/counter used by the existing entry contract.
-- Existing registrations retain their participant identity and behavior.
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS entry_kind text NOT NULL DEFAULT 'participant',
  ADD COLUMN IF NOT EXISTS entry_chest_number text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.registrations'::regclass
      AND conname = 'registrations_entry_kind_check'
  ) THEN
    ALTER TABLE public.registrations
      ADD CONSTRAINT registrations_entry_kind_check
      CHECK (entry_kind IN ('participant', 'general_team'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.registrations'::regclass
      AND conname = 'registrations_general_team_identity_check'
  ) THEN
    ALTER TABLE public.registrations
      ADD CONSTRAINT registrations_general_team_identity_check
      CHECK (entry_kind <> 'general_team' OR (participant_id IS NULL AND organisation_id IS NOT NULL));
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS registrations_general_entry_chest_unique
  ON public.registrations (festival_id, entry_chest_number)
  WHERE entry_kind = 'general_team' AND entry_chest_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.general_entry_number_counters (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  festival_id uuid NOT NULL REFERENCES public.festival_calendar(id) ON DELETE CASCADE,
  next_number bigint NOT NULL DEFAULT 1 CHECK (next_number > 0),
  PRIMARY KEY (festival_id),
  UNIQUE (tenant_id, festival_id)
);
ALTER TABLE public.general_entry_number_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.general_entry_number_counters FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_team_leader_programs(p_participant_id uuid)
RETURNS TABLE (
  item_id uuid,
  item_code text,
  item_name_en text,
  item_name_ml text,
  category_codes text[],
  gender text,
  participation_type text,
  group_min_members integer,
  group_max_members integer,
  entry_kind text,
  is_assigned boolean,
  is_eligible boolean,
  team_entry_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_context record;
  v_festival public.festival_calendar%ROWTYPE;
  v_participant public.participants%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_context FROM public.get_team_leader_context();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active Team Leader portal assignment is required.' USING ERRCODE = '42501';
  END IF;

  SELECT f.* INTO v_festival
  FROM public.festival_calendar f
  WHERE f.id = v_context.festival_id AND f.tenant_id = v_context.parent_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The assigned festival is unavailable.' USING ERRCODE = '42501';
  END IF;

  SELECT p.* INTO v_participant
  FROM public.participants p
  WHERE p.id = p_participant_id
    AND p.tenant_id = v_context.parent_tenant_id
    AND p.festival_id = v_context.festival_id
    AND p.organisation_id = v_context.organisation_id;
  IF NOT FOUND OR v_participant.status = 'rejected' THEN
    RAISE EXCEPTION 'This student is not available in your team.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT i.id,
         i.item_code,
         i.item_name_en,
         i.item_name_ml,
         i.category_codes,
         i.gender,
         i.participation_type,
         i.group_min_members,
         i.group_max_members,
         CASE WHEN lower(COALESCE(i.participation_type, '')) = 'group' THEN 'general_team' ELSE 'participant' END,
         EXISTS (
           SELECT 1 FROM public.registrations r
           WHERE r.participant_id = v_participant.id AND r.item_id = i.id AND r.entry_kind = 'participant'
         ),
         (
           CASE
             WHEN lower(COALESCE(i.participation_type, '')) = 'group' THEN
               i.is_active IS TRUE
               AND v_festival.general_category_enabled IS TRUE
               AND cardinality(COALESCE(i.category_codes, ARRAY[]::text[])) = 1
               AND upper(btrim(COALESCE(i.category_codes[1], ''))) IN ('GN', 'GENERAL')
               AND COALESCE(i.group_min_members, 0) >= 1
             ELSE
               i.is_active IS TRUE
               AND v_participant.status IS DISTINCT FROM 'rejected'
               AND (v_participant.plagiarism_ban_until IS NULL OR v_participant.plagiarism_ban_until <= current_date)
               AND (
                 EXISTS (
                   SELECT 1
                   FROM unnest(COALESCE(i.category_codes, ARRAY[]::text[])) AS item_category(code)
                   WHERE upper(btrim(item_category.code)) IN (
                     upper(btrim(COALESCE(v_participant.category_code, ''))),
                     CASE upper(btrim(COALESCE(v_participant.category_code, '')))
                       WHEN 'JUNIOR' THEN 'JR' WHEN 'JR' THEN 'JUNIOR'
                       WHEN 'SENIOR' THEN 'SR' WHEN 'SR' THEN 'SENIOR'
                       WHEN 'CAMPUS' THEN 'CA' WHEN 'CA' THEN 'CAMPUS'
                       ELSE upper(btrim(COALESCE(v_participant.category_code, '')))
                     END
                   )
                 )
                 OR EXISTS (
                   SELECT 1
                   FROM unnest(COALESCE(i.category_codes, ARRAY[]::text[])) AS item_category(code)
                   WHERE upper(btrim(item_category.code)) IN ('GN', 'GENERAL')
                 )
               )
               AND (
                 COALESCE(lower(btrim(i.gender)), 'both') IN ('', 'both')
                 OR lower(btrim(i.gender)) = lower(btrim(COALESCE(v_participant.gender, '')))
               )
           END
         ),
         CASE WHEN lower(COALESCE(i.participation_type, '')) = 'group' THEN (
           SELECT count(*)::integer FROM public.registrations r
           WHERE r.item_id = i.id AND r.festival_id = v_context.festival_id
             AND r.organisation_id = v_context.organisation_id AND r.entry_kind = 'general_team'
         ) ELSE 0 END
  FROM public.items i
  WHERE i.festival_id = v_context.festival_id
    AND (i.tenant_id IS NULL OR i.tenant_id = v_context.parent_tenant_id)
    AND lower(COALESCE(i.participation_type, '')) IN ('individual', 'group')
    AND (
      lower(COALESCE(i.participation_type, '')) = 'individual'
      OR (
        cardinality(COALESCE(i.category_codes, ARRAY[]::text[])) = 1
        AND upper(btrim(COALESCE(i.category_codes[1], ''))) IN ('GN', 'GENERAL')
      )
    )
    AND (
      i.is_active IS TRUE
      OR EXISTS (
        SELECT 1 FROM public.registrations r
        WHERE r.item_id = i.id AND (
          (r.participant_id = v_participant.id AND r.entry_kind = 'participant')
          OR (r.organisation_id = v_context.organisation_id AND r.entry_kind = 'general_team')
        )
      )
    )
  ORDER BY i.item_name_en NULLS LAST, i.item_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.team_leader_create_general_entry(
  p_item_id uuid,
  p_participant_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_context record;
  v_festival public.festival_calendar%ROWTYPE;
  v_item public.items%ROWTYPE;
  v_member_count integer;
  v_number bigint;
  v_chest_number text;
  v_registration_id uuid;
  v_member_names jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_context FROM public.get_team_leader_context();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active Team Leader portal assignment is required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_festival
  FROM public.festival_calendar f
  WHERE f.id = v_context.festival_id
    AND f.tenant_id = v_context.parent_tenant_id
    AND f.is_active IS TRUE
    AND f.general_category_enabled IS TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'General category is disabled for this festival.';
  END IF;

  SELECT * INTO v_item
  FROM public.items i
  WHERE i.id = p_item_id
    AND i.festival_id = v_context.festival_id
    AND i.tenant_id = v_context.parent_tenant_id
    AND i.is_active IS TRUE
    AND i.participation_type IS NOT DISTINCT FROM 'group'
    AND cardinality(COALESCE(i.category_codes, ARRAY[]::text[])) = 1
    AND upper(btrim(i.category_codes[1])) IN ('GN', 'GENERAL')
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Select an active group program in the General category.';
  END IF;

  IF p_participant_ids IS NULL OR cardinality(p_participant_ids) = 0 THEN
    RAISE EXCEPTION 'Select the required team members before creating this entry.';
  END IF;
  v_member_count := cardinality(p_participant_ids);
  IF (SELECT count(DISTINCT member_id) FROM unnest(p_participant_ids) AS ids(member_id)) <> v_member_count THEN
    RAISE EXCEPTION 'A student can only be selected once for this entry.';
  END IF;
  IF COALESCE(v_item.group_min_members, 0) < 1
     OR v_member_count < v_item.group_min_members
     OR (COALESCE(v_item.group_max_members, 0) > 0 AND v_member_count > v_item.group_max_members) THEN
    RAISE EXCEPTION 'The selected team size is outside this program''s configured member range.';
  END IF;

  IF COALESCE(lower(btrim(v_item.gender)), 'both') NOT IN ('', 'both') AND EXISTS (
    SELECT 1 FROM public.participants p
    WHERE p.id = ANY(p_participant_ids)
      AND lower(btrim(COALESCE(p.gender, ''))) <> lower(btrim(v_item.gender))
  ) THEN
    RAISE EXCEPTION 'All selected students must match this program''s gender eligibility.';
  END IF;

  IF (
    SELECT count(*) FROM public.participants p
    WHERE p.id = ANY(p_participant_ids)
      AND p.tenant_id = v_context.parent_tenant_id
      AND p.festival_id = v_context.festival_id
      AND p.organisation_id = v_context.organisation_id
      AND p.status IS DISTINCT FROM 'rejected'
      AND upper(btrim(COALESCE(p.category_code, ''))) NOT IN ('GN', 'GENERAL')
  ) <> v_member_count THEN
    RAISE EXCEPTION 'All selected students must belong to your team and be available for General programs.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.general_entry_number_counters (tenant_id, festival_id, next_number)
  VALUES (v_context.parent_tenant_id, v_context.festival_id, 2)
  ON CONFLICT (festival_id) DO UPDATE
    SET next_number = public.general_entry_number_counters.next_number + 1
  RETURNING next_number - 1 INTO v_number;
  v_chest_number := 'GE-' || lpad(v_number::text, 5, '0');

  SELECT jsonb_agg(p.name ORDER BY p.chest_number NULLS LAST, p.name, p.id)
  INTO v_member_names
  FROM public.participants p WHERE p.id = ANY(p_participant_ids);

  INSERT INTO public.registrations (
    tenant_id, festival_id, item_id, participant_id, organisation_id,
    status, is_group_registration, entry_kind, entry_chest_number, raw_group_members
  ) VALUES (
    v_context.parent_tenant_id, v_context.festival_id, v_item.id, NULL,
    v_context.organisation_id, 'approved', TRUE, 'general_team', v_chest_number, v_member_names
  ) RETURNING id INTO v_registration_id;

  INSERT INTO public.group_members (registration_id, participant_id)
  SELECT v_registration_id, member_id FROM unnest(p_participant_ids) AS ids(member_id);

  RETURN jsonb_build_object(
    'registration_id', v_registration_id,
    'entry_chest_number', v_chest_number,
    'organisation_id', v_context.organisation_id,
    'member_count', v_member_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.team_leader_assign_program(
  p_participant_id uuid,
  p_item_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_context record;
  v_participant public.participants%ROWTYPE;
  v_item public.items%ROWTYPE;
  v_registration_id uuid;
  v_category_matches boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_context FROM public.get_team_leader_context();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active Team Leader portal assignment is required.' USING ERRCODE = '42501';
  END IF;

  SELECT p.* INTO v_participant
  FROM public.participants p
  WHERE p.id = p_participant_id
    AND p.tenant_id = v_context.parent_tenant_id
    AND p.festival_id = v_context.festival_id
    AND p.organisation_id = v_context.organisation_id
  FOR UPDATE;
  IF NOT FOUND OR v_participant.status = 'rejected' THEN
    RAISE EXCEPTION 'This student is not available in your team.' USING ERRCODE = '42501';
  END IF;

  SELECT i.* INTO v_item
  FROM public.items i
  WHERE i.id = p_item_id
    AND i.festival_id = v_context.festival_id
    AND (i.tenant_id IS NULL OR i.tenant_id = v_context.parent_tenant_id)
    AND i.is_active IS TRUE
    AND lower(COALESCE(i.participation_type, '')) = 'individual'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This program is unavailable.' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM unnest(COALESCE(v_item.category_codes, ARRAY[]::text[])) AS item_category(code)
    WHERE upper(btrim(item_category.code)) IN (
      upper(btrim(COALESCE(v_participant.category_code, ''))),
      CASE upper(btrim(COALESCE(v_participant.category_code, '')))
        WHEN 'JUNIOR' THEN 'JR' WHEN 'JR' THEN 'JUNIOR'
        WHEN 'SENIOR' THEN 'SR' WHEN 'SR' THEN 'SENIOR'
        WHEN 'CAMPUS' THEN 'CA' WHEN 'CA' THEN 'CAMPUS'
        ELSE upper(btrim(COALESCE(v_participant.category_code, '')))
      END,
      'GN', 'GENERAL'
    )
  ) INTO v_category_matches;

  IF NOT v_category_matches THEN
    RAISE EXCEPTION 'This program is not available for the student category.' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(lower(btrim(v_item.gender)), 'both') NOT IN ('', 'both')
     AND lower(btrim(v_item.gender)) <> lower(btrim(COALESCE(v_participant.gender, ''))) THEN
    RAISE EXCEPTION 'This program is not available for the student gender.' USING ERRCODE = '22023';
  END IF;
  IF v_participant.plagiarism_ban_until > current_date THEN
    RAISE EXCEPTION 'An active registration restriction prevents this student from entering programs.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.registrations (
    tenant_id, festival_id, participant_id, item_id, organisation_id, status
  ) VALUES (
    v_context.parent_tenant_id, v_context.festival_id, v_participant.id,
    v_item.id, v_context.organisation_id, 'pending'
  )
  ON CONFLICT (participant_id, item_id) DO NOTHING
  RETURNING id INTO v_registration_id;

  IF v_registration_id IS NULL THEN
    RAISE EXCEPTION 'This student is already assigned to the selected program.' USING ERRCODE = '23505';
  END IF;

  RETURN jsonb_build_object(
    'registration_id', v_registration_id,
    'participant_id', v_participant.id,
    'item_id', v_item.id,
    'status', 'pending'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_team_leader_programs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_leader_programs(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.team_leader_assign_program(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_leader_assign_program(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.team_leader_create_general_entry(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_leader_create_general_entry(uuid, uuid[]) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
