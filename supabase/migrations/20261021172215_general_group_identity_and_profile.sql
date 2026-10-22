BEGIN;

CREATE SCHEMA IF NOT EXISTS group_entry_private;
REVOKE ALL ON SCHEMA group_entry_private FROM PUBLIC, anon, authenticated;
ALTER TABLE public.general_entry_number_counters ADD COLUMN numeric_next_number bigint;

-- Independent of the historical GE counter: existing printed numbers stay valid.
CREATE FUNCTION group_entry_private.allocate_chest(p_festival uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_id uuid; start_number bigint; candidate bigint;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('entry-chest:'||p_festival::text,0));
  SELECT tenant_id, CASE WHEN chest_number_category_range=1000 THEN 100 ELSE 1000 END
    INTO owner_id,start_number FROM public.festival_calendar WHERE id=p_festival;
  IF NOT FOUND THEN RAISE EXCEPTION 'Festival not found.'; END IF;
  INSERT INTO public.general_entry_number_counters(tenant_id,festival_id)
    VALUES(owner_id,p_festival) ON CONFLICT(festival_id) DO NOTHING;
  SELECT GREATEST(COALESCE(numeric_next_number,start_number),start_number)
    INTO candidate FROM public.general_entry_number_counters WHERE festival_id=p_festival FOR UPDATE;
  LOOP
    EXIT WHEN NOT EXISTS(SELECT 1 FROM public.participants WHERE festival_id=p_festival AND chest_number=candidate::text)
      AND NOT EXISTS(SELECT 1 FROM public.registrations WHERE festival_id=p_festival AND entry_kind='general_team' AND entry_chest_number=candidate::text);
    candidate:=candidate+1;
  END LOOP;
  UPDATE public.general_entry_number_counters SET numeric_next_number=candidate+1 WHERE festival_id=p_festival;
  RETURN candidate::text;
END $$;

CREATE FUNCTION group_entry_private.guard_participant_chest() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.chest_number IS NULL OR NEW.festival_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND NEW.chest_number IS NOT DISTINCT FROM OLD.chest_number
    AND NEW.festival_id IS NOT DISTINCT FROM OLD.festival_id THEN RETURN NEW; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('entry-chest:'||NEW.festival_id::text,0));
  IF EXISTS(SELECT 1 FROM public.registrations WHERE festival_id=NEW.festival_id AND entry_kind='general_team'
    AND entry_chest_number=NEW.chest_number) THEN
    RAISE EXCEPTION 'Chest number is reserved by a General group entry.'
      USING ERRCODE='23505', CONSTRAINT='unique_active_chest_number';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER group_entry_participant_chest_guard BEFORE INSERT OR UPDATE OF chest_number,festival_id ON public.participants
FOR EACH ROW EXECUTE FUNCTION group_entry_private.guard_participant_chest();

CREATE FUNCTION group_entry_private.guard_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='UPDATE' AND (OLD.entry_kind='general_team' OR NEW.entry_kind='general_team') AND
    (NEW.entry_kind,NEW.tenant_id,NEW.festival_id,NEW.item_id,NEW.organisation_id,NEW.participant_id,NEW.entry_chest_number)
    IS DISTINCT FROM (OLD.entry_kind,OLD.tenant_id,OLD.festival_id,OLD.item_id,OLD.organisation_id,OLD.participant_id,OLD.entry_chest_number) THEN
    RAISE EXCEPTION 'A General entry identity cannot be changed. Create a separate entry.' USING ERRCODE='23514';
  END IF;
  IF NEW.entry_kind<>'general_team' THEN RETURN NEW; END IF;
  IF NEW.participant_id IS NOT NULL OR NEW.is_group_registration IS NOT TRUE OR NEW.organisation_id IS NULL THEN
    RAISE EXCEPTION 'General entries belong to a group, not an individual participant.' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' AND NULLIF(btrim(NEW.entry_chest_number),'') IS NULL THEN
    NEW.entry_chest_number:=group_entry_private.allocate_chest(NEW.festival_id);
  END IF;
  IF NULLIF(btrim(NEW.entry_chest_number),'') IS NULL THEN RAISE EXCEPTION 'Group chest number is required.'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('entry-chest:'||NEW.festival_id::text,0));
  IF EXISTS(SELECT 1 FROM public.participants WHERE festival_id=NEW.festival_id AND chest_number=NEW.entry_chest_number) THEN
    RAISE EXCEPTION 'Group chest number conflicts with a participant.' USING ERRCODE='23505';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER group_entry_identity_guard BEFORE INSERT OR UPDATE ON public.registrations
FOR EACH ROW EXECUTE FUNCTION group_entry_private.guard_identity();

CREATE FUNCTION group_entry_private.guard_member() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE entry public.registrations; target uuid;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.registration_id,NEW.participant_id) IS NOT DISTINCT FROM (OLD.registration_id,OLD.participant_id) THEN RETURN NEW; END IF;
  -- Prevent moving an existing protected membership to a different entry.
  IF TG_OP='UPDATE' AND NEW.registration_id IS DISTINCT FROM OLD.registration_id AND EXISTS(
    SELECT 1 FROM public.registrations WHERE id=OLD.registration_id AND entry_kind='general_team') THEN
    RAISE EXCEPTION 'Remove a membership before assigning it to another group.' USING ERRCODE='23514';
  END IF;
  target:=CASE WHEN TG_OP='DELETE' THEN OLD.registration_id ELSE NEW.registration_id END;
  SELECT * INTO entry FROM public.registrations WHERE id=target FOR UPDATE;
  IF entry.entry_kind='general_team' THEN
    IF entry.is_verified IS TRUE OR entry.code_letter IS NOT NULL
      OR EXISTS(SELECT 1 FROM public.results WHERE registration_id=entry.id)
      OR EXISTS(SELECT 1 FROM public.mark_entries WHERE registration_id=entry.id) THEN
      RAISE EXCEPTION 'Group roster is locked after check-in, code letters, marks or results.' USING ERRCODE='55000';
    END IF;
    IF TG_OP<>'DELETE' THEN
      IF NOT EXISTS(SELECT 1 FROM public.participants WHERE id=NEW.participant_id
        AND festival_id=entry.festival_id AND organisation_id=entry.organisation_id
        AND status IS DISTINCT FROM 'rejected') THEN
        RAISE EXCEPTION 'Group members must belong to the same festival and team.' USING ERRCODE='23514';
      END IF;
      IF EXISTS(SELECT 1 FROM public.group_members WHERE registration_id=entry.id AND participant_id=NEW.participant_id
        AND id IS DISTINCT FROM NEW.id) THEN
        RAISE EXCEPTION 'This student is already a member of this group.' USING ERRCODE='23505';
      END IF;
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER general_group_members_guard BEFORE INSERT OR UPDATE OR DELETE ON public.group_members
FOR EACH ROW EXECUTE FUNCTION group_entry_private.guard_member();

CREATE INDEX general_group_members_participant_idx ON public.group_members(participant_id,registration_id);
CREATE INDEX general_group_members_registration_idx ON public.group_members(registration_id,participant_id);
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA group_entry_private FROM PUBLIC,anon,authenticated;

-- Existing scoped authorization remains the gate for operational roster data.
CREATE OR REPLACE FUNCTION public.get_stage_management_registrations_with_letters(
  p_schedule_id uuid DEFAULT NULL,p_festival_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT COALESCE(pg_catalog.jsonb_agg(to_jsonb(scoped)||pg_catalog.jsonb_build_object(
    'code_letter_fixed',r.code_letter_fixed,'entry_kind',r.entry_kind,'entry_chest_number',r.entry_chest_number,
    'members',CASE WHEN r.entry_kind='general_team' THEN COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name',p.name,'chest_number',p.chest_number)
        ORDER BY p.name,p.id) FROM public.group_members gm JOIN public.participants p ON p.id=gm.participant_id
      WHERE gm.registration_id=r.id),'[]'::jsonb) ELSE '[]'::jsonb END)),'[]'::jsonb)
  FROM public.get_stage_management_registrations_scoped(p_schedule_id,p_festival_id) scoped
  JOIN public.registrations r ON r.id=scoped.id;
$$;
REVOKE ALL ON FUNCTION public.get_stage_management_registrations_with_letters(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_stage_management_registrations_with_letters(uuid,uuid) TO authenticated;


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

  v_chest_number := group_entry_private.allocate_chest(p_festival_id);

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

  v_chest_number := group_entry_private.allocate_chest(v_context.festival_id);

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

CREATE OR REPLACE FUNCTION public.get_public_candidate_profile(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_participant record;
  v_result jsonb;
BEGIN
  SELECT
    p.id,
    p.profile_slug,
    p.name,
    p.photo_url,
    p.category_code,
    p.profile_bio,
    p.public_profile_enabled,
    p.show_organisation_public,
    org.name AS organisation_name,
    org.org_type AS organisation_type
  INTO v_participant
  FROM participants p
  LEFT JOIN organisations org ON org.id = p.organisation_id
  WHERE p.profile_slug = p_slug
    AND COALESCE(p.public_profile_enabled, true) IS TRUE
  LIMIT 1;

  IF v_participant.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'profile', jsonb_build_object(
      'id', v_participant.id,
      'slug', v_participant.profile_slug,
      'name', v_participant.name,
      'photo_url', v_participant.photo_url,
      'category_code', v_participant.category_code,
      'bio', COALESCE(v_participant.profile_bio, ''),
      'organisation_name', CASE WHEN COALESCE(v_participant.show_organisation_public, true) THEN v_participant.organisation_name ELSE NULL END,
      'organisation_type', CASE WHEN COALESCE(v_participant.show_organisation_public, true) THEN v_participant.organisation_type ELSE NULL END
    ),
    'participated_items', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'registration_id', reg.id,
          'entry_kind', reg.entry_kind,
          'entry_chest_number', reg.entry_chest_number,
          'item_id', itm.id,
          'item_name', COALESCE(itm.item_name_en, ''),
          'item_name_ml', COALESCE(itm.item_name_ml, ''),
          'category_codes', COALESCE(itm.category_codes, ARRAY[]::text[]),
          'participation_type', COALESCE(itm.participation_type, 'individual'),
          'status', COALESCE(reg.status, 'registered')
        )
        ORDER BY COALESCE(itm.item_name_ml, itm.item_name_en, '')
      )
      FROM registrations reg
      LEFT JOIN items itm ON itm.id = reg.item_id
      WHERE (reg.participant_id = v_participant.id OR (
          reg.entry_kind='general_team' AND reg.participant_id IS NULL
          AND EXISTS(SELECT 1 FROM public.group_members gm
            JOIN public.participants member ON member.id=gm.participant_id
            WHERE gm.registration_id=reg.id AND gm.participant_id=v_participant.id
              AND member.festival_id=reg.festival_id)))
        AND reg.status IS DISTINCT FROM 'rejected'
    ), '[]'::jsonb),
    'published_results', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'result_id', res.id,
          'item_id', itm.id,
          'item_name', COALESCE(itm.item_name_en, ''),
          'item_name_ml', COALESCE(itm.item_name_ml, ''),
          'rank', res.rank,
          'grade', res.grade,
          'points_awarded', COALESCE(res.points_awarded, 0),
          'published_at', res.published_at
        )
        ORDER BY res.rank NULLS LAST, res.published_at DESC NULLS LAST
      )
      FROM results res
      LEFT JOIN registrations reg ON reg.id = res.registration_id
      LEFT JOIN items itm ON itm.id = res.item_id
      WHERE reg.participant_id = v_participant.id
        AND res.published IS TRUE
        AND COALESCE(res.result_status, 'draft') = 'published'
        AND COALESCE(res.public_visible, false) IS TRUE
        AND reg.status IS DISTINCT FROM 'rejected'
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.create_general_team_entry(uuid,uuid,uuid[]),public.team_leader_create_general_entry(uuid,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_general_team_entry(uuid,uuid,uuid[]),public.team_leader_create_general_entry(uuid,uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION public.get_public_candidate_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_candidate_profile(text) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
