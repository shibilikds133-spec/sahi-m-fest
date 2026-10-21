-- Match Admin enrollment rules and tenant ownership for Team Leader assignments.

-- Preserve exact team scope and include General entries in operations and results.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_team_leader_participants()
RETURNS TABLE (id uuid,name text,gender text,category_code text,chest_number text,status text,festival_id uuid,organisation_id uuid,profile_slug text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT p.id,p.name,p.gender,p.category_code,p.chest_number,p.status,p.festival_id,p.organisation_id,p.profile_slug FROM public.participants p
 JOIN public.get_team_leader_context() c ON c.festival_id=p.festival_id AND c.organisation_id=p.organisation_id JOIN public.organisations o ON o.id=c.organisation_id
 WHERE auth.uid() IS NOT NULL AND o.tenant_id IS NOT NULL AND p.tenant_id IN(c.parent_tenant_id,o.tenant_id)
 AND EXISTS(SELECT 1 FROM public.get_visible_organisations(c.parent_tenant_id) v WHERE v.id=o.id AND v.tenant_id=o.tenant_id);
$$;

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
  v_org_tenant_id uuid;
  v_is_post_hs_religious boolean := false;
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

  SELECT o.tenant_id INTO v_org_tenant_id FROM public.organisations o WHERE o.id=v_context.organisation_id AND o.tenant_id IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.get_visible_organisations(v_context.parent_tenant_id) visible WHERE visible.id=o.id AND visible.tenant_id=o.tenant_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'The assigned team is outside the festival tenant scope.' USING ERRCODE='42501'; END IF;

  SELECT p.* INTO v_participant
  FROM public.participants p
  WHERE p.id = p_participant_id
    AND p.tenant_id IN (v_context.parent_tenant_id, v_org_tenant_id)
    AND p.festival_id = v_context.festival_id
    AND p.organisation_id = v_context.organisation_id;
  IF NOT FOUND OR v_participant.status = 'rejected' THEN
    RAISE EXCEPTION 'This student is not available in your team.' USING ERRCODE = '42501';
  END IF;
  -- The Admin model treats this legacy participant field as optional and no
  -- migration in this branch declares it, so read it without a static column
  -- dependency while preserving the Admin rule when it is present.
  v_is_post_hs_religious := COALESCE((to_jsonb(v_participant)->>'is_post_hs_religious')::boolean, false);

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
            WHERE r.participant_id = v_participant.id
              AND r.festival_id = v_context.festival_id
              AND r.item_id = i.id
              AND r.organisation_id = v_context.organisation_id
              AND r.entry_kind = 'participant'
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
                  EXISTS (SELECT 1 FROM unnest(COALESCE(i.category_codes, ARRAY[]::text[])) AS c(code) WHERE upper(btrim(c.code)) IN (
                    upper(btrim(COALESCE(v_participant.category_code,''))),
                    CASE upper(btrim(COALESCE(v_participant.category_code,''))) WHEN 'JUNIOR' THEN 'JR' WHEN 'JR' THEN 'JUNIOR' WHEN 'SENIOR' THEN 'SR' WHEN 'SR' THEN 'SENIOR' WHEN 'CAMPUS' THEN 'CA' WHEN 'CA' THEN 'CAMPUS' ELSE upper(btrim(COALESCE(v_participant.category_code,''))) END))
                  OR (v_is_post_hs_religious IS TRUE AND EXISTS(SELECT 1 FROM unnest(COALESCE(i.category_codes, ARRAY[]::text[])) AS c(code) WHERE upper(btrim(c.code)) IN ('JR','JUNIOR','SR','SENIOR')))
                  OR EXISTS(SELECT 1 FROM unnest(COALESCE(i.category_codes, ARRAY[]::text[])) AS c(code) WHERE upper(btrim(c.code)) IN ('GN','GENERAL'))
                )
                AND NOT (v_is_post_hs_religious IS TRUE AND EXISTS(SELECT 1 FROM unnest(COALESCE(i.category_codes, ARRAY[]::text[])) AS c(code) WHERE upper(btrim(c.code))='HS'))
                AND NOT EXISTS(SELECT 1 FROM public.registrations r WHERE r.participant_id=v_participant.id AND r.festival_id=v_context.festival_id AND r.organisation_id IS DISTINCT FROM v_context.organisation_id)
                AND (COALESCE(lower(btrim(i.gender)),'both') IN ('','both') OR lower(btrim(i.gender))=lower(btrim(COALESCE(v_participant.gender,''))))
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
  v_org_tenant_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_context FROM public.get_team_leader_context();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active Team Leader portal assignment is required.' USING ERRCODE = '42501';
  END IF;

  SELECT o.tenant_id INTO v_org_tenant_id FROM public.organisations o
  WHERE o.id=v_context.organisation_id AND o.tenant_id IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.get_visible_organisations(v_context.parent_tenant_id) visible WHERE visible.id=o.id AND visible.tenant_id=o.tenant_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'The assigned team is outside the festival tenant scope.' USING ERRCODE='42501'; END IF;

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
      AND p.tenant_id IN (v_context.parent_tenant_id, v_org_tenant_id)
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
    v_org_tenant_id, v_context.festival_id, v_item.id, NULL,
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
  v_org_tenant_id uuid;
  v_is_post_hs_religious boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_context FROM public.get_team_leader_context();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active Team Leader portal assignment is required.' USING ERRCODE = '42501';
  END IF;

  SELECT o.tenant_id INTO v_org_tenant_id FROM public.organisations o
  WHERE o.id=v_context.organisation_id AND o.tenant_id IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.get_visible_organisations(v_context.parent_tenant_id) visible WHERE visible.id=o.id AND visible.tenant_id=o.tenant_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'The assigned team is outside the festival tenant scope.' USING ERRCODE='42501'; END IF;

  SELECT p.* INTO v_participant
  FROM public.participants p
  WHERE p.id = p_participant_id
    AND p.tenant_id IN (v_context.parent_tenant_id, v_org_tenant_id)
    AND p.festival_id = v_context.festival_id
    AND p.organisation_id = v_context.organisation_id
  FOR UPDATE;
  IF NOT FOUND OR v_participant.status = 'rejected' THEN
    RAISE EXCEPTION 'This student is not available in your team.' USING ERRCODE = '42501';
  END IF;
  v_is_post_hs_religious := COALESCE((to_jsonb(v_participant)->>'is_post_hs_religious')::boolean, false);

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

  SELECT EXISTS(SELECT 1 FROM unnest(COALESCE(v_item.category_codes,ARRAY[]::text[])) AS c(code) WHERE upper(btrim(c.code)) IN (
    upper(btrim(COALESCE(v_participant.category_code,''))),
    CASE upper(btrim(COALESCE(v_participant.category_code,''))) WHEN 'JUNIOR' THEN 'JR' WHEN 'JR' THEN 'JUNIOR' WHEN 'SENIOR' THEN 'SR' WHEN 'SR' THEN 'SENIOR' WHEN 'CAMPUS' THEN 'CA' WHEN 'CA' THEN 'CAMPUS' ELSE upper(btrim(COALESCE(v_participant.category_code,''))) END,'GN','GENERAL')) INTO v_category_matches;
  IF NOT v_category_matches AND NOT (v_is_post_hs_religious IS TRUE AND EXISTS(SELECT 1 FROM unnest(COALESCE(v_item.category_codes,ARRAY[]::text[])) AS c(code) WHERE upper(btrim(c.code)) IN ('JR','JUNIOR','SR','SENIOR'))) THEN
    RAISE EXCEPTION 'This program is not available for the student category.' USING ERRCODE='22023';
  END IF;
  IF v_is_post_hs_religious IS TRUE AND EXISTS(SELECT 1 FROM unnest(COALESCE(v_item.category_codes,ARRAY[]::text[])) AS c(code) WHERE upper(btrim(c.code))='HS') THEN
    RAISE EXCEPTION 'Religious students after HS must compete in JR/SR only.' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM public.registrations r WHERE r.participant_id=v_participant.id AND r.festival_id=v_context.festival_id AND r.organisation_id IS DISTINCT FROM v_context.organisation_id) THEN
    RAISE EXCEPTION 'A participant cannot compete from multiple teams in the same festival.' USING ERRCODE='42501';
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
    v_participant.tenant_id, v_context.festival_id, v_participant.id,
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

CREATE OR REPLACE FUNCTION public.get_team_leader_schedule()
RETURNS TABLE (schedule_id uuid,item_id uuid,item_code text,item_name text,category_codes text[],venue_name text,start_time timestamptz,end_time timestamptz,event_status text,participant_count bigint,checked_in_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT s.id,s.item_id,i.item_code,COALESCE(i.item_name_en,i.item_name_ml),i.category_codes,v.name,s.start_time,s.end_time,s.status,COUNT(DISTINCT COALESCE(p.id,gp.id)),COUNT(DISTINCT r.id) FILTER(WHERE r.is_verified IS TRUE)
 FROM public.schedules s JOIN public.get_team_leader_context() c ON c.festival_id=s.festival_id AND c.parent_tenant_id=s.tenant_id JOIN public.organisations o ON o.id=c.organisation_id
 JOIN public.items i ON i.id=s.item_id AND(i.tenant_id IS NULL OR i.tenant_id=c.parent_tenant_id) LEFT JOIN public.venues v ON v.id=s.venue_id AND v.tenant_id=c.parent_tenant_id
 LEFT JOIN public.registrations r ON r.festival_id=s.festival_id AND r.item_id=s.item_id AND r.organisation_id=c.organisation_id AND r.status NOT IN('rejected','cancelled')
 LEFT JOIN public.participants p ON p.id=r.participant_id AND p.festival_id=s.festival_id AND p.organisation_id=c.organisation_id AND p.tenant_id IN(c.parent_tenant_id,o.tenant_id)
 LEFT JOIN public.group_members gm ON gm.registration_id=r.id AND r.entry_kind='general_team' LEFT JOIN public.participants gp ON gp.id=gm.participant_id AND gp.festival_id=s.festival_id AND gp.organisation_id=c.organisation_id AND gp.tenant_id IN(c.parent_tenant_id,o.tenant_id)
 WHERE o.tenant_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.get_visible_organisations(c.parent_tenant_id) v WHERE v.id=o.id AND v.tenant_id=o.tenant_id)
 GROUP BY s.id,s.item_id,i.item_code,i.item_name_en,i.item_name_ml,i.category_codes,v.name,s.start_time,s.end_time,s.status ORDER BY s.start_time NULLS LAST;
$$;

CREATE OR REPLACE FUNCTION public.get_team_leader_published_results()
RETURNS TABLE (result_id uuid,item_code text,item_name text,participant_name text,rank int,grade text,points_awarded int,published_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT DISTINCT res.id,i.item_code,COALESCE(i.item_name_en,i.item_name_ml),CASE WHEN r.entry_kind='general_team' THEN COALESCE(r.entry_chest_number,o.name,'General team') ELSE p.name END,res.rank,res.grade,res.points_awarded,res.published_at
 FROM public.results res JOIN public.get_team_leader_context() c ON c.festival_id=res.festival_id AND c.parent_tenant_id=res.tenant_id JOIN public.organisations o ON o.id=c.organisation_id
 JOIN public.items i ON i.id=res.item_id AND(i.tenant_id IS NULL OR i.tenant_id=c.parent_tenant_id) JOIN public.registrations r ON r.id=res.registration_id AND r.festival_id=c.festival_id AND r.organisation_id=c.organisation_id
 LEFT JOIN public.participants p ON p.id=r.participant_id AND p.festival_id=c.festival_id AND p.organisation_id=c.organisation_id AND p.tenant_id IN(c.parent_tenant_id,o.tenant_id)
 WHERE res.published IS TRUE AND res.result_status='published' AND res.public_visible IS TRUE AND o.tenant_id IS NOT NULL
 AND EXISTS(SELECT 1 FROM public.get_visible_organisations(c.parent_tenant_id) v WHERE v.id=o.id AND v.tenant_id=o.tenant_id) ORDER BY res.published_at DESC NULLS LAST,res.rank NULLS LAST;
$$;

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

-- Parent Admin accounts can read General member details for organisations in
-- their visible tree. Team Leaders remain blocked from direct table access by
-- the existing restrictive Team Leader RLS policy and use scoped RPCs only.
DROP POLICY IF EXISTS group_members_visible_registration_read ON public.group_members;
CREATE POLICY group_members_visible_registration_read
  ON public.group_members FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.registrations r
      WHERE r.id = group_members.registration_id
        AND public.is_org_visible(r.organisation_id)
    )
  );

REVOKE ALL ON FUNCTION public.get_team_leader_participants() FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_team_leader_participants() TO authenticated;
REVOKE ALL ON FUNCTION public.get_team_leader_programs(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_team_leader_programs(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.team_leader_assign_program(uuid,uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.team_leader_assign_program(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.team_leader_create_general_entry(uuid,uuid[]) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.team_leader_create_general_entry(uuid,uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION public.get_team_leader_schedule() FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_team_leader_schedule() TO authenticated;
REVOKE ALL ON FUNCTION public.get_team_leader_published_results() FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_team_leader_published_results() TO authenticated;
REVOKE ALL ON FUNCTION public.get_schedule_registrations(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_schedule_registrations(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_stage_management_registrations(uuid,uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_stage_management_registrations(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_stage_management_registrations_scoped(uuid,uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_stage_management_registrations_scoped(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema'; COMMIT;
