-- General competitions use one team-level registration and their own chest
-- number. Member participant IDs are linked only for profile/result lookup;
-- marks and results remain keyed to the team registration.
BEGIN;

ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS entry_kind text NOT NULL DEFAULT 'participant',
  ADD COLUMN IF NOT EXISTS entry_chest_number text;

ALTER TABLE public.registrations
  ADD CONSTRAINT registrations_entry_kind_check
    CHECK (entry_kind IN ('participant', 'general_team')),
  ADD CONSTRAINT registrations_general_team_identity_check
    CHECK (entry_kind <> 'general_team' OR (participant_id IS NULL AND organisation_id IS NOT NULL));

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

CREATE OR REPLACE FUNCTION public.create_general_team_entry(
  p_festival_id uuid,
  p_item_id uuid,
  p_participant_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_festival public.festival_calendar%ROWTYPE;
  v_item public.items%ROWTYPE;
  v_org_id uuid;
  v_org_tenant_id uuid;
  v_member_count integer;
  v_number bigint;
  v_chest_number text;
  v_registration_id uuid;
  v_member_names jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND OR (v_actor.role IS DISTINCT FROM 'admin' AND v_actor.is_superadmin IS NOT TRUE) THEN
    RAISE EXCEPTION 'Only an administrator can create a General team entry.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_festival FROM public.festival_calendar WHERE id = p_festival_id;
  IF NOT FOUND OR v_festival.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'The selected festival is not active.';
  END IF;
  IF v_actor.is_superadmin IS NOT TRUE
     AND v_actor.tenant_id IS DISTINCT FROM v_festival.tenant_id THEN
    RAISE EXCEPTION 'The selected festival is outside your tenant.' USING ERRCODE = '42501';
  END IF;
  IF v_festival.general_category_enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'General category is disabled for this festival.';
  END IF;

  SELECT * INTO v_item FROM public.items
  WHERE id = p_item_id AND festival_id = p_festival_id AND tenant_id = v_festival.tenant_id;
  IF NOT FOUND OR v_item.is_active IS NOT TRUE
     OR v_item.participation_type IS DISTINCT FROM 'group'
     OR cardinality(v_item.category_codes) IS DISTINCT FROM 1
     OR upper(btrim(v_item.category_codes[1])) NOT IN ('GN', 'GENERAL') THEN
    RAISE EXCEPTION 'Select an active group competition in the General category.';
  END IF;

  IF p_participant_ids IS NULL OR cardinality(p_participant_ids) = 0 THEN
    RAISE EXCEPTION 'Select the team members before creating the entry.';
  END IF;
  v_member_count := cardinality(p_participant_ids);
  IF (SELECT count(DISTINCT member_id) FROM unnest(p_participant_ids) AS ids(member_id)) <> v_member_count THEN
    RAISE EXCEPTION 'A participant can only be selected once for this entry.';
  END IF;
  IF COALESCE(v_item.group_min_members, 0) < 1
     OR v_member_count < v_item.group_min_members
     OR (COALESCE(v_item.group_max_members, 0) > 0 AND v_member_count > v_item.group_max_members) THEN
    RAISE EXCEPTION 'The selected team size is outside this competition''s configured member range.';
  END IF;

  SELECT p.organisation_id, o.tenant_id
    INTO v_org_id, v_org_tenant_id
  FROM public.participants p
  JOIN public.organisations o ON o.id = p.organisation_id
  WHERE p.id = ANY(p_participant_ids)
    AND p.festival_id = p_festival_id
    AND p.organisation_id IS NOT NULL
    AND upper(btrim(COALESCE(p.category_code, ''))) NOT IN ('GN', 'GENERAL')
    AND o.tenant_id IS NOT NULL
  ORDER BY p.id
  LIMIT 1;

  IF v_org_id IS NULL OR v_org_tenant_id IS NULL OR EXISTS (
    SELECT 1 FROM public.participants p
    WHERE p.id = ANY(p_participant_ids)
      AND (p.festival_id IS DISTINCT FROM p_festival_id
        OR p.organisation_id IS DISTINCT FROM v_org_id
        OR upper(btrim(COALESCE(p.category_code, ''))) IN ('GN', 'GENERAL'))
  ) OR (SELECT count(*) FROM public.participants p
        WHERE p.id = ANY(p_participant_ids) AND p.festival_id = p_festival_id) <> v_member_count THEN
    RAISE EXCEPTION 'All selected participants must belong to this festival and the same team.';
  END IF;

  IF v_actor.is_superadmin IS NOT TRUE AND NOT EXISTS (
    SELECT 1 FROM public.get_visible_organisations(v_actor.tenant_id) visible
    WHERE visible.id = v_org_id
  ) THEN
    RAISE EXCEPTION 'The selected team is outside your organisation scope.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.general_entry_number_counters (tenant_id, festival_id, next_number)
  VALUES (v_festival.tenant_id, p_festival_id, 2)
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
    v_org_tenant_id, p_festival_id, p_item_id, NULL, v_org_id,
    'approved', TRUE, 'general_team', v_chest_number, v_member_names
  ) RETURNING id INTO v_registration_id;

  INSERT INTO public.group_members (registration_id, participant_id)
  SELECT v_registration_id, member_id FROM unnest(p_participant_ids) AS ids(member_id);

  RETURN jsonb_build_object(
    'registration_id', v_registration_id,
    'entry_chest_number', v_chest_number,
    'organisation_id', v_org_id,
    'member_count', v_member_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_general_team_entry(uuid, uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_general_team_entry(uuid, uuid, uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_participant_general_results(p_participant_id uuid)
RETURNS TABLE (
  registration_id uuid,
  item_id uuid,
  item_code text,
  item_name_en text,
  item_name_ml text,
  entry_chest_number text,
  rank integer,
  grade text,
  published_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_participant public.participants%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
  SELECT * INTO v_participant FROM public.participants WHERE id = p_participant_id;
  IF NOT FOUND OR (v_actor.role IS DISTINCT FROM 'admin' AND v_actor.is_superadmin IS NOT TRUE) THEN
    RAISE EXCEPTION 'Participant or administrator access was not found.' USING ERRCODE = '42501';
  END IF;
  IF v_actor.is_superadmin IS NOT TRUE AND (
    v_actor.tenant_id IS DISTINCT FROM public.get_my_tenant_id()
    OR NOT EXISTS (
      SELECT 1 FROM public.get_visible_organisations(v_actor.tenant_id) visible
      WHERE visible.id = v_participant.organisation_id
    )
  ) THEN
    RAISE EXCEPTION 'Participant is outside your tenant.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT r.id, i.id, i.item_code, i.item_name_en, i.item_name_ml,
         r.entry_chest_number, res.rank, res.grade, res.published_at
  FROM public.group_members gm
  JOIN public.registrations r ON r.id = gm.registration_id AND r.entry_kind = 'general_team'
  JOIN public.items i ON i.id = r.item_id
  LEFT JOIN public.results res ON res.registration_id = r.id AND res.published IS TRUE
  WHERE gm.participant_id = p_participant_id
    AND r.festival_id = v_participant.festival_id
    AND (v_actor.is_superadmin IS TRUE OR r.tenant_id = v_actor.tenant_id OR r.organisation_id IN (
      SELECT visible.id FROM public.get_visible_organisations(v_actor.tenant_id) visible
    ))
  ORDER BY res.published_at DESC NULLS LAST, i.item_name_en;
END;
$$;

REVOKE ALL ON FUNCTION public.get_participant_general_results(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_participant_general_results(uuid) TO authenticated;

-- Keep the existing operational result shapes while allowing a General team
-- registration to render using its own chest number instead of a participant.
CREATE OR REPLACE FUNCTION public.get_schedule_registrations(p_schedule_id uuid)
RETURNS TABLE (
  id uuid, item_id uuid, participant_id uuid, organisation_id uuid,
  festival_id uuid, tenant_id uuid, status text, is_verified boolean,
  code_letter text, participants jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
  v_schedule public.schedules%ROWTYPE;
  v_festival_id uuid;
BEGIN
  v_tenant_id := public.stage_assert_admin_access();
  SELECT s.* INTO v_schedule FROM public.schedules s
  WHERE s.id = p_schedule_id AND s.tenant_id = v_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'The requested schedule is outside the current tenant scope.' USING ERRCODE = '42501'; END IF;
  SELECT COALESCE(v_schedule.festival_id, i.festival_id) INTO v_festival_id
  FROM public.items i WHERE i.id = v_schedule.item_id;
  IF v_festival_id IS NULL THEN RAISE EXCEPTION 'The schedule festival context is missing.' USING ERRCODE = '42501'; END IF;

  RETURN QUERY
  SELECT r.id, r.item_id, r.participant_id, r.organisation_id, r.festival_id,
    r.tenant_id, r.status, r.is_verified, r.code_letter,
    CASE WHEN r.entry_kind = 'general_team' THEN jsonb_build_object(
      'id', NULL, 'name', COALESCE(o.name, 'General team'),
      'chest_number', r.entry_chest_number, 'category_code', 'GN',
      'organisations', jsonb_build_object('id', o.id, 'name', o.name, 'org_type', o.org_type)
    ) ELSE COALESCE(to_jsonb(p), '{}'::jsonb) END
  FROM public.registrations r
  LEFT JOIN public.participants p ON p.id = r.participant_id AND p.festival_id = v_festival_id
  LEFT JOIN public.organisations o ON o.id = COALESCE(r.organisation_id, p.organisation_id)
  WHERE r.festival_id = v_festival_id AND r.item_id = v_schedule.item_id
    AND (r.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible)
      OR r.tenant_id IN (SELECT visible.tenant_id FROM public.get_visible_organisations(v_tenant_id) visible))
    AND (r.entry_kind = 'general_team' OR (p.id IS NOT NULL AND (
      p.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible)
      OR p.tenant_id IN (SELECT visible.tenant_id FROM public.get_visible_organisations(v_tenant_id) visible)
    )))
  ORDER BY COALESCE(r.entry_chest_number, p.chest_number) NULLS LAST, p.name, r.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_stage_management_registrations(
  p_schedule_id uuid DEFAULT NULL, p_festival_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid, item_id uuid, participant_id uuid, organisation_id uuid,
  status text, is_verified boolean, code_letter text, participant_name text,
  participant_chest_number text, participant_category_code text,
  organisation_name text, organisation_type text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
  v_festival_id uuid;
  v_item_id uuid;
BEGIN
  v_tenant_id := public.stage_assert_admin_access();
  IF p_schedule_id IS NOT NULL THEN
    SELECT s.festival_id, s.item_id INTO v_festival_id, v_item_id
    FROM public.schedules s WHERE s.id = p_schedule_id AND s.tenant_id = v_tenant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'The requested schedule does not belong to this tenant.' USING ERRCODE = '42501'; END IF;
  ELSE
    v_festival_id := p_festival_id;
    IF v_festival_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.festival_calendar f WHERE f.id = v_festival_id
        AND f.tenant_id = v_tenant_id AND f.is_active IS TRUE
    ) THEN RAISE EXCEPTION 'The requested festival is not active for this tenant.' USING ERRCODE = '42501'; END IF;
  END IF;

  RETURN QUERY
  SELECT r.id, r.item_id, r.participant_id, r.organisation_id, r.status,
    r.is_verified, r.code_letter,
    CASE WHEN r.entry_kind = 'general_team' THEN COALESCE(o.name, 'General team') ELSE p.name END,
    COALESCE(r.entry_chest_number, p.chest_number),
    CASE WHEN r.entry_kind = 'general_team' THEN 'GN' ELSE p.category_code END,
    o.name, o.org_type
  FROM public.registrations r
  LEFT JOIN public.participants p ON p.id = r.participant_id AND p.festival_id = v_festival_id
  LEFT JOIN public.organisations o ON o.id = COALESCE(r.organisation_id, p.organisation_id)
  WHERE r.festival_id = v_festival_id AND (v_item_id IS NULL OR r.item_id = v_item_id)
    AND (r.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible)
      OR r.tenant_id IN (SELECT visible.tenant_id FROM public.get_visible_organisations(v_tenant_id) visible)
      OR p.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible))
    AND (r.entry_kind = 'general_team' OR p.id IS NOT NULL)
  ORDER BY COALESCE(r.entry_chest_number, p.chest_number) NULLS LAST, p.name, r.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_stage_management_registrations_scoped(
  p_schedule_id uuid DEFAULT NULL, p_festival_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid, schedule_id uuid, item_id uuid, participant_id uuid,
  organisation_id uuid, status text, is_verified boolean, code_letter text,
  participant_name text, participant_chest_number text,
  participant_category_code text, organisation_name text, organisation_type text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
  v_festival_id uuid;
BEGIN
  v_tenant_id := public.stage_assert_admin_access();
  IF p_schedule_id IS NOT NULL THEN
    SELECT s.festival_id INTO v_festival_id FROM public.schedules s
    WHERE s.id = p_schedule_id AND s.tenant_id = v_tenant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'The requested schedule does not belong to this tenant.' USING ERRCODE = '42501'; END IF;
  ELSE
    v_festival_id := p_festival_id;
    IF v_festival_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.festival_calendar f WHERE f.id = v_festival_id
        AND f.tenant_id = v_tenant_id AND f.is_active IS TRUE
    ) THEN RAISE EXCEPTION 'The requested festival is not active for this tenant.' USING ERRCODE = '42501'; END IF;
  END IF;

  RETURN QUERY
  SELECT r.id, s.id, r.item_id, r.participant_id, r.organisation_id,
    r.status, r.is_verified, r.code_letter,
    CASE WHEN r.entry_kind = 'general_team' THEN COALESCE(o.name, 'General team') ELSE p.name END,
    COALESCE(r.entry_chest_number, p.chest_number),
    CASE WHEN r.entry_kind = 'general_team' THEN 'GN' ELSE p.category_code END,
    o.name, o.org_type
  FROM public.registrations r
  LEFT JOIN public.participants p ON p.id = r.participant_id AND p.festival_id = v_festival_id
  LEFT JOIN public.organisations o ON o.id = COALESCE(r.organisation_id, p.organisation_id)
  JOIN public.schedules s ON s.tenant_id = v_tenant_id AND s.festival_id = v_festival_id
    AND s.item_id = r.item_id AND (p_schedule_id IS NULL OR s.id = p_schedule_id)
  WHERE r.festival_id = v_festival_id
    AND (r.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible)
      OR r.tenant_id IN (SELECT visible.tenant_id FROM public.get_visible_organisations(v_tenant_id) visible)
      OR p.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible))
    AND (r.entry_kind = 'general_team' OR p.id IS NOT NULL)
  ORDER BY COALESCE(r.entry_chest_number, p.chest_number) NULLS LAST, p.name, r.id, s.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_schedule_registrations(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_schedule_registrations(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_stage_management_registrations(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_stage_management_registrations(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_stage_management_registrations_scoped(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_stage_management_registrations_scoped(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
