-- Group is a participation type, independent of category. Keep the historical
-- general_team discriminator for API/result compatibility. A leader is an
-- operational representative, never the result's individual participant.
BEGIN;

ALTER TABLE public.registrations ADD COLUMN group_leader_participant_id uuid
  REFERENCES public.participants(id) ON DELETE RESTRICT;
ALTER TABLE public.group_members ADD COLUMN member_order integer;
ALTER TABLE public.registrations ADD CONSTRAINT group_leader_entry_kind_check
  CHECK (group_leader_participant_id IS NULL OR entry_kind = 'general_team');
CREATE UNIQUE INDEX group_team_entry_one_per_item
  ON public.registrations(festival_id, item_id, organisation_id)
  WHERE entry_kind = 'general_team' AND group_leader_participant_id IS NOT NULL;
CREATE INDEX group_entry_leader_lookup ON public.registrations(group_leader_participant_id)
  WHERE group_leader_participant_id IS NOT NULL;

CREATE FUNCTION group_entry_private.chest_number(p_entry public.registrations)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT COALESCE((SELECT p.chest_number FROM public.participants p
    WHERE p.id=p_entry.group_leader_participant_id AND p.festival_id=p_entry.festival_id
      AND p.organisation_id=p_entry.organisation_id), p_entry.entry_chest_number);
$$;
CREATE FUNCTION group_entry_private.category_code(p_entry public.registrations)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT i.category_codes[1] FROM public.items i WHERE i.id=p_entry.item_id AND i.festival_id=p_entry.festival_id;
$$;
CREATE FUNCTION group_entry_private.display_name(p_entry public.registrations)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT COALESCE((SELECT p.name FROM public.participants p
    WHERE p.id=p_entry.group_leader_participant_id AND p.festival_id=p_entry.festival_id
      AND p.organisation_id=p_entry.organisation_id),
    (SELECT o.name FROM public.organisations o WHERE o.id=p_entry.organisation_id), 'Group entry');
$$;

CREATE OR REPLACE FUNCTION group_entry_private.guard_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='UPDATE' AND (OLD.entry_kind='general_team' OR NEW.entry_kind='general_team') AND
    (NEW.entry_kind,NEW.tenant_id,NEW.festival_id,NEW.item_id,NEW.organisation_id,NEW.participant_id,NEW.entry_chest_number)
    IS DISTINCT FROM (OLD.entry_kind,OLD.tenant_id,OLD.festival_id,OLD.item_id,OLD.organisation_id,OLD.participant_id,OLD.entry_chest_number) THEN
    RAISE EXCEPTION 'A group entry identity cannot be changed.' USING ERRCODE='23514';
  END IF;
  IF NEW.entry_kind<>'general_team' THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' AND NOT EXISTS (SELECT 1 FROM group_entry_private.member_edit_authorizations a
    WHERE a.transaction_id=pg_catalog.txid_current() AND a.registration_id=NEW.id AND a.actor_id=auth.uid()) THEN
    RAISE EXCEPTION 'Create group entries through the group enrollment API.' USING ERRCODE='42501';
  END IF;
  IF NEW.participant_id IS NOT NULL OR NEW.is_group_registration IS NOT TRUE OR NEW.organisation_id IS NULL THEN
    RAISE EXCEPTION 'Group results belong to the team.' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND OLD.group_leader_participant_id IS NOT NULL AND NEW.group_leader_participant_id IS NULL THEN
    RAISE EXCEPTION 'Select a replacement team leader before saving.' USING ERRCODE='23514';
  END IF;
  IF NEW.group_leader_participant_id IS NOT NULL THEN
    IF TG_OP='INSERT' AND NEW.entry_chest_number IS NOT NULL THEN
      RAISE EXCEPTION 'Use the team leader chest number; a new group number is not needed.' USING ERRCODE='23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.participants p
      WHERE p.id=NEW.group_leader_participant_id AND p.festival_id=NEW.festival_id
        AND p.organisation_id=NEW.organisation_id AND p.status IS DISTINCT FROM 'rejected'
        AND NULLIF(pg_catalog.btrim(p.chest_number),'') IS NOT NULL) THEN
      RAISE EXCEPTION 'Select an eligible team leader with a chest number.' USING ERRCODE='23514';
    END IF;
    IF TG_OP='UPDATE' AND NEW.group_leader_participant_id IS DISTINCT FROM OLD.group_leader_participant_id
      AND NOT EXISTS (SELECT 1 FROM group_entry_private.member_edit_authorizations a
        WHERE a.transaction_id=pg_catalog.txid_current() AND a.registration_id=NEW.id AND a.actor_id=auth.uid()) THEN
      RAISE EXCEPTION 'Change the leader through Edit members.' USING ERRCODE='42501';
    END IF;
  ELSIF TG_OP='INSERT' THEN
    RAISE EXCEPTION 'Select the first group member as team leader.' USING ERRCODE='23514';
  END IF;
  -- Legacy entries keep their number until an admin explicitly selects a leader.
  RETURN NEW;
END $$;

CREATE FUNCTION group_entry_private.guard_leader_team_move() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF (NEW.festival_id,NEW.organisation_id) IS DISTINCT FROM (OLD.festival_id,OLD.organisation_id)
    AND EXISTS (SELECT 1 FROM public.registrations r WHERE r.group_leader_participant_id=OLD.id) THEN
    RAISE EXCEPTION 'Choose another group leader before moving this participant to another team or festival.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER group_leader_team_move_guard BEFORE UPDATE OF festival_id,organisation_id ON public.participants
  FOR EACH ROW EXECUTE FUNCTION group_entry_private.guard_leader_team_move();

CREATE FUNCTION group_entry_private.ensure_leader_membership() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid; v_entry public.registrations;
BEGIN
  IF TG_TABLE_NAME='registrations' THEN v_id:=NEW.id;
  ELSIF TG_OP='DELETE' THEN v_id:=OLD.registration_id;
  ELSE v_id:=NEW.registration_id; END IF;
  SELECT * INTO v_entry FROM public.registrations WHERE id=v_id;
  IF v_entry.group_leader_participant_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.group_members gm WHERE gm.registration_id=v_id
      AND gm.participant_id=v_entry.group_leader_participant_id) THEN
    RAISE EXCEPTION 'The team leader must be included in the group roster.' USING ERRCODE='23514';
  END IF;
  IF v_entry.group_leader_participant_id IS NOT NULL THEN
    PERFORM group_entry_private.validate_roster(v_entry.festival_id,v_entry.item_id,v_entry.organisation_id,
      ARRAY(SELECT gm.participant_id FROM public.group_members gm WHERE gm.registration_id=v_id));
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER group_leader_registration_membership AFTER INSERT OR UPDATE ON public.registrations
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION group_entry_private.ensure_leader_membership();
CREATE CONSTRAINT TRIGGER group_leader_roster_membership AFTER INSERT OR UPDATE OR DELETE ON public.group_members
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION group_entry_private.ensure_leader_membership();

CREATE FUNCTION group_entry_private.validate_roster(p_festival uuid,p_item uuid,p_org uuid,p_members uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_item public.items; v_count integer;
BEGIN
  SELECT * INTO v_item FROM public.items WHERE id=p_item AND festival_id=p_festival;
  IF NOT FOUND OR v_item.participation_type IS DISTINCT FROM 'group'
    OR pg_catalog.cardinality(v_item.category_codes) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Select a single-category group competition.' USING ERRCODE='23514';
  END IF;
  v_count:=pg_catalog.cardinality(p_members);
  IF p_members IS NULL OR v_count=0 OR pg_catalog.array_position(p_members,NULL) IS NOT NULL
    OR (SELECT count(DISTINCT x) FROM pg_catalog.unnest(p_members) x)<>v_count THEN
    RAISE EXCEPTION 'Select unique group members.' USING ERRCODE='23514';
  END IF;
  IF (SELECT count(*) FROM public.participants p JOIN public.organisations o ON o.id=p.organisation_id
    JOIN public.festival_calendar f ON f.id=p.festival_id
    WHERE p.id=ANY(p_members) AND p.festival_id=p_festival AND p.organisation_id=p_org
      AND p.tenant_id IN(f.tenant_id,o.tenant_id) AND p.status IS DISTINCT FROM 'rejected'
      AND (p.plagiarism_ban_until IS NULL OR p.plagiarism_ban_until<=CURRENT_DATE)
      AND NOT (COALESCE((pg_catalog.to_jsonb(p)->>'is_post_hs_religious')::boolean,false)
        AND EXISTS (SELECT 1 FROM pg_catalog.unnest(v_item.category_codes) c WHERE pg_catalog.upper(pg_catalog.btrim(c))='HS'))
      AND NOT EXISTS (SELECT 1 FROM public.registrations other_entry
        LEFT JOIN public.group_members other_member ON other_member.registration_id=other_entry.id
        WHERE other_entry.festival_id=p_festival AND other_entry.organisation_id IS DISTINCT FROM p_org
          AND (other_entry.participant_id=p.id OR other_member.participant_id=p.id))
      AND (COALESCE(pg_catalog.lower(pg_catalog.btrim(v_item.gender)),'both') IN ('','both')
        OR pg_catalog.lower(pg_catalog.btrim(p.gender))=pg_catalog.lower(pg_catalog.btrim(v_item.gender)))
      AND (v_item.category_codes && ARRAY['GN','GENERAL']
      OR (COALESCE((pg_catalog.to_jsonb(p)->>'is_post_hs_religious')::boolean,false) AND EXISTS (
        SELECT 1 FROM pg_catalog.unnest(v_item.category_codes) c WHERE pg_catalog.upper(pg_catalog.btrim(c)) IN ('JR','JUNIOR','SR','SENIOR')))
      OR EXISTS (
        SELECT 1 FROM pg_catalog.unnest(v_item.category_codes) c WHERE
          CASE pg_catalog.upper(pg_catalog.btrim(c)) WHEN 'JUNIOR' THEN 'JR' WHEN 'SENIOR' THEN 'SR' WHEN 'CAMPUS' THEN 'CA' ELSE pg_catalog.upper(pg_catalog.btrim(c)) END
          = CASE pg_catalog.upper(pg_catalog.btrim(p.category_code)) WHEN 'JUNIOR' THEN 'JR' WHEN 'SENIOR' THEN 'SR' WHEN 'CAMPUS' THEN 'CA' ELSE pg_catalog.upper(pg_catalog.btrim(p.category_code)) END
      )))<>v_count THEN
    RAISE EXCEPTION 'All members must be eligible participants from this festival and team.' USING ERRCODE='23514';
  END IF;
END $$;

CREATE FUNCTION group_entry_private.create_entry(p_festival uuid,p_item uuid,p_org uuid,p_members uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_festival public.festival_calendar; v_item public.items; v_id uuid; v_names jsonb; v_leader uuid;
BEGIN
  SELECT * INTO v_festival FROM public.festival_calendar WHERE id=p_festival AND is_active IS TRUE;
  SELECT * INTO v_item FROM public.items WHERE id=p_item AND festival_id=p_festival
    AND tenant_id=v_festival.tenant_id AND is_active IS TRUE FOR SHARE;
  IF v_festival.id IS NULL OR v_item.id IS NULL THEN RAISE EXCEPTION 'Select an active competition in this festival.'; END IF;
  IF v_item.category_codes && ARRAY['GN','GENERAL'] AND v_festival.general_category_enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'General category is disabled for this festival.' USING ERRCODE='23514';
  END IF;
  PERFORM group_entry_private.validate_roster(p_festival,p_item,p_org,p_members);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('group:'||p_festival::text||':'||p_item::text||':'||p_org::text,0));
  IF EXISTS (SELECT 1 FROM public.registrations r WHERE r.festival_id=p_festival AND r.item_id=p_item AND r.organisation_id=p_org) THEN
    RAISE EXCEPTION 'This team already has entries for this group competition. Edit the existing roster; legacy entries require review.' USING ERRCODE='23505';
  END IF;
  v_leader:=p_members[1];
  SELECT pg_catalog.jsonb_agg(p.name ORDER BY m.position) INTO v_names
    FROM pg_catalog.unnest(p_members) WITH ORDINALITY m(id,position) JOIN public.participants p ON p.id=m.id;
  v_id:=pg_catalog.gen_random_uuid();
  INSERT INTO group_entry_private.member_edit_authorizations(transaction_id,registration_id,actor_id)
    VALUES(pg_catalog.txid_current(),v_id,auth.uid());
  INSERT INTO public.registrations(id,tenant_id,festival_id,item_id,participant_id,organisation_id,
    status,is_group_registration,entry_kind,group_leader_participant_id,raw_group_members)
  VALUES(v_id,v_festival.tenant_id,p_festival,p_item,NULL,p_org,'approved',true,'general_team',v_leader,v_names)
  RETURNING id INTO v_id;
  INSERT INTO public.group_members(registration_id,participant_id,member_order)
    SELECT v_id,m.id,m.position::integer FROM pg_catalog.unnest(p_members) WITH ORDINALITY m(id,position);
  DELETE FROM group_entry_private.member_edit_authorizations WHERE transaction_id=pg_catalog.txid_current();
  RETURN pg_catalog.jsonb_build_object('registration_id',v_id,'organisation_id',p_org,
    'leader_participant_id',v_leader,'entry_chest_number',(SELECT chest_number FROM public.participants WHERE id=v_leader),
    'member_count',pg_catalog.cardinality(p_members));
END $$;

CREATE OR REPLACE FUNCTION public.create_general_team_entry(p_festival_id uuid,p_item_id uuid,p_participant_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor public.profiles; v_owner uuid; v_org uuid;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid();
  SELECT tenant_id INTO v_owner FROM public.festival_calendar WHERE id=p_festival_id;
  IF v_actor.id IS NULL OR (v_actor.role IS DISTINCT FROM 'admin' AND v_actor.is_superadmin IS NOT TRUE)
    OR v_owner IS NULL OR (v_actor.is_superadmin IS NOT TRUE AND v_actor.tenant_id IS DISTINCT FROM v_owner) THEN
    RAISE EXCEPTION 'Administrator access to this festival is required.' USING ERRCODE='42501';
  END IF;
  SELECT organisation_id INTO v_org FROM public.participants WHERE id=p_participant_ids[1] AND festival_id=p_festival_id;
  IF v_org IS NULL OR (v_actor.is_superadmin IS NOT TRUE AND NOT EXISTS (
    SELECT 1 FROM public.get_visible_organisations(v_actor.tenant_id) o WHERE o.id=v_org)) THEN
    RAISE EXCEPTION 'This team is outside your organisation scope.' USING ERRCODE='42501';
  END IF;
  RETURN group_entry_private.create_entry(p_festival_id,p_item_id,v_org,p_participant_ids);
END $$;

CREATE OR REPLACE FUNCTION public.team_leader_create_general_entry(p_item_id uuid,p_participant_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_context record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication is required.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_context FROM public.get_team_leader_context();
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.get_visible_organisations(v_context.parent_tenant_id) o
    WHERE o.id=v_context.organisation_id) THEN
    RAISE EXCEPTION 'An active Team Leader assignment is required.' USING ERRCODE='42501';
  END IF;
  RETURN group_entry_private.create_entry(v_context.festival_id,p_item_id,v_context.organisation_id,p_participant_ids);
END $$;

CREATE FUNCTION public.update_group_team_roster(p_registration_id uuid,p_participant_ids uuid[],
  p_expected_participant_ids uuid[],p_leader_participant_id uuid,p_expected_leader_participant_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor public.profiles; v_entry public.registrations; v_owner uuid; v_old uuid[]; v_expected uuid[]; v_names jsonb;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid();
  SELECT * INTO v_entry FROM public.registrations WHERE id=p_registration_id FOR UPDATE;
  SELECT tenant_id INTO v_owner FROM public.festival_calendar WHERE id=v_entry.festival_id;
  IF v_actor.id IS NULL OR (v_actor.role IS DISTINCT FROM 'admin' AND v_actor.is_superadmin IS NOT TRUE)
    OR v_owner IS NULL OR (v_actor.is_superadmin IS NOT TRUE AND v_actor.tenant_id IS DISTINCT FROM v_owner)
    OR (v_actor.is_superadmin IS NOT TRUE AND NOT EXISTS (
      SELECT 1 FROM public.get_visible_organisations(v_actor.tenant_id) o WHERE o.id=v_entry.organisation_id)) THEN
    RAISE EXCEPTION 'Administrator access to this team is required.' USING ERRCODE='42501';
  END IF;
  IF v_entry.entry_kind IS DISTINCT FROM 'general_team' THEN RAISE EXCEPTION 'Group entry not found.'; END IF;
  SELECT COALESCE(pg_catalog.array_agg(participant_id ORDER BY participant_id),'{}'::uuid[]) INTO v_old
    FROM public.group_members WHERE registration_id=v_entry.id;
  SELECT COALESCE(pg_catalog.array_agg(x ORDER BY x),'{}'::uuid[]) INTO v_expected FROM pg_catalog.unnest(p_expected_participant_ids) x;
  IF p_expected_participant_ids IS NULL OR v_old IS DISTINCT FROM v_expected
    OR v_entry.group_leader_participant_id IS DISTINCT FROM p_expected_leader_participant_id THEN
    RAISE EXCEPTION 'This roster changed. Reload before saving.' USING ERRCODE='40001';
  END IF;
  PERFORM group_entry_private.validate_roster(v_entry.festival_id,v_entry.item_id,v_entry.organisation_id,p_participant_ids);
  IF p_leader_participant_id IS NULL OR NOT (p_leader_participant_id=ANY(p_participant_ids)) THEN
    RAISE EXCEPTION 'Select a team leader from the current members.' USING ERRCODE='23514';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('group:'||v_entry.festival_id::text||':'||v_entry.item_id::text||':'||v_entry.organisation_id::text,0));
  IF EXISTS (SELECT 1 FROM public.registrations r WHERE r.festival_id=v_entry.festival_id AND r.item_id=v_entry.item_id
    AND r.organisation_id=v_entry.organisation_id AND r.id<>v_entry.id) THEN
    RAISE EXCEPTION 'This team has multiple historical entries. Review the conflict before choosing a leader.' USING ERRCODE='23505';
  END IF;
  INSERT INTO group_entry_private.member_edit_authorizations(transaction_id,registration_id,actor_id)
    VALUES(pg_catalog.txid_current(),v_entry.id,auth.uid());
  DELETE FROM public.group_members WHERE registration_id=v_entry.id AND NOT (participant_id=ANY(p_participant_ids));
  INSERT INTO public.group_members(registration_id,participant_id,member_order)
    SELECT v_entry.id,m.id,m.position::integer FROM pg_catalog.unnest(p_participant_ids) WITH ORDINALITY m(id,position)
    WHERE NOT EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.registration_id=v_entry.id AND gm.participant_id=m.id);
  SELECT pg_catalog.jsonb_agg(p.name ORDER BY m.position) INTO v_names
    FROM pg_catalog.unnest(p_participant_ids) WITH ORDINALITY m(id,position) JOIN public.participants p ON p.id=m.id;
  UPDATE public.registrations SET group_leader_participant_id=p_leader_participant_id,raw_group_members=v_names WHERE id=v_entry.id;
  DELETE FROM group_entry_private.member_edit_authorizations WHERE transaction_id=pg_catalog.txid_current();
  INSERT INTO public.audit_logs(tenant_id,user_id,action,table_name,record_id,old_value,new_value)
    VALUES(v_owner,auth.uid(),'group_roster_edit','registrations',v_entry.id,
      pg_catalog.jsonb_build_object('member_ids',v_old,'leader_id',v_entry.group_leader_participant_id),
      pg_catalog.jsonb_build_object('member_ids',p_participant_ids,'leader_id',p_leader_participant_id));
  RETURN pg_catalog.jsonb_build_object('registration_id',v_entry.id,'member_count',pg_catalog.cardinality(p_participant_ids),
    'leader_participant_id',p_leader_participant_id,'entry_chest_number',(SELECT chest_number FROM public.participants WHERE id=p_leader_participant_id),'changed',true);
END $$;

-- The older roster RPC remains usable for old entries. Once a leader is set,
-- it must be retained; a replacement is explicitly chosen through the new RPC.
DO $patch$
DECLARE d text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef('public.update_general_team_roster(uuid,uuid[],uuid[])'::regprocedure) INTO d;
  d:=replace(d,E'\r\n',E'\n');
  d:=replace(d, E'    OR upper(btrim(v_item.category_codes[1])) NOT IN (''GN'',''GENERAL'')', '');
  d:=replace(d, E'    AND upper(btrim(COALESCE(p.category_code,''''))) NOT IN (''GN'',''GENERAL'')', '');
  EXECUTE d;
END $patch$;

-- Preserve authorization and result identities in the existing read APIs.
-- Only the displayed group name, category and chest source are adapted.
DO $patch$
DECLARE f record; d text;
BEGIN
  FOR f IN SELECT p.oid,p.proname FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname=ANY(ARRAY['get_schedule_registrations',
      'get_stage_management_registrations','get_stage_management_registrations_scoped',
      'get_stage_management_registrations_with_letters','stage_venue_portal_data',
      'stage_venue_portal_draw_letters','get_public_candidate_profile','get_participant_general_results',
      'get_team_leader_published_results','get_judge_registrations']) LOOP
    d:=pg_catalog.pg_get_functiondef(f.oid);
    d:=replace(d,'r.entry_chest_number','group_entry_private.chest_number(r)');
    d:=replace(d,'reg.entry_chest_number','group_entry_private.chest_number(reg)');
    d:=replace(d,'COALESCE(o.name, ''General team'')','group_entry_private.display_name(r)');
    d:=replace(d,'''category_code'', ''GN''','''category_code'', group_entry_private.category_code(r)');
    d:=replace(d,'THEN ''GN'' ELSE p.category_code','THEN group_entry_private.category_code(r) ELSE p.category_code');
    d:=replace(d,'''id'', NULL, ''name''','''id'', r.group_leader_participant_id, ''name''');
    IF f.proname='get_judge_registrations' THEN
      d:=replace(d,'registration.code_letter, participant.name, participant.chest_number,',
        'registration.code_letter, CASE WHEN registration.entry_kind=''general_team'' THEN group_entry_private.display_name(registration) ELSE participant.name END, CASE WHEN registration.entry_kind=''general_team'' THEN group_entry_private.chest_number(registration) ELSE participant.chest_number END,');
      d:=replace(d,'participant.photo_url, participant.category_code, registration.is_verified,',
        'participant.photo_url, CASE WHEN registration.entry_kind=''general_team'' THEN group_entry_private.category_code(registration) ELSE participant.category_code END, registration.is_verified,');
    END IF;
    EXECUTE d;
  END LOOP;
END $patch$;

-- Existing completion and portal contracts now classify by participation type.
DO $patch$
DECLARE d text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef('public.set_program_intake_status(uuid,uuid,text,text,boolean)'::regprocedure) INTO d;
  d:=replace(d,E'\r\n',E'\n');
  d:=replace(d, '(v_category NOT IN (''GN'', ''GENERAL'') OR v_item.participation_type IS DISTINCT FROM ''group'')',
    'v_item.participation_type IS DISTINCT FROM ''group''');
  d:=replace(d, 'IF p_entry_kind = ''general_team'' AND v_festival.general_category_enabled IS NOT TRUE THEN',
    'IF v_category IN (''GN'', ''GENERAL'') AND v_festival.general_category_enabled IS NOT TRUE THEN');
  d:=replace(d, $old$  IF p_entry_kind = 'participant' AND v_category IN ('GN', 'GENERAL') THEN
    RAISE EXCEPTION 'General competitions are completed through team entries.';
  END IF;$old$, $new$  IF p_entry_kind = 'participant' AND v_item.participation_type = 'group' THEN
    p_entry_kind := 'general_team';
  END IF;$new$);
  EXECUTE d;

  SELECT pg_catalog.pg_get_functiondef('public.reopen_program_intake_on_registration_change()'::regprocedure) INTO d;
  d:=replace(d,E'\r\n',E'\n');
  d:=replace(d, 'v_category := ''GN'';',
    'SELECT upper(btrim(i.category_codes[1])) INTO v_category FROM public.items i WHERE i.id=v_item_id;');
  d:=replace(d, 'IF v_entry_kind = ''general_team'' THEN',
    'IF v_entry_kind = ''general_team'' OR EXISTS (SELECT 1 FROM public.items i WHERE i.id=v_item_id AND i.participation_type=''group'') THEN');
  d:=replace(d, '    v_kind := ''participant'';', $new$
    IF v_category IS NULL THEN
      SELECT upper(btrim(c.code)) INTO v_category FROM public.items i
        CROSS JOIN LATERAL unnest(i.category_codes) c(code)
        WHERE i.id=v_item_id AND upper(btrim(c.code)) IN ('GN','GENERAL') LIMIT 1;
    END IF;
    v_kind := 'participant';$new$);
  d:=replace(d, '(v_kind = ''general_team'' OR v_category NOT IN ('''', ''GN'', ''GENERAL''))', 'v_category <> ''''');
  EXECUTE d;

  SELECT pg_catalog.pg_get_functiondef('public.get_team_leader_programs(uuid)'::regprocedure) INTO d;
  d:=replace(d,E'\r\n',E'\n');
  d:=replace(d, $old$               AND v_festival.general_category_enabled IS TRUE
               AND cardinality(COALESCE(i.category_codes, ARRAY[]::text[])) = 1
               AND upper(btrim(COALESCE(i.category_codes[1], ''))) IN ('GN', 'GENERAL')
               AND COALESCE(i.group_min_members, 0) >= 1$old$, $new$               AND cardinality(COALESCE(i.category_codes, ARRAY[]::text[])) = 1
               AND (NOT (i.category_codes && ARRAY['GN','GENERAL']) OR v_festival.general_category_enabled IS TRUE)$new$);
  d:=replace(d, $old$    AND (
      lower(COALESCE(i.participation_type, '')) = 'individual'
      OR (
        cardinality(COALESCE(i.category_codes, ARRAY[]::text[])) = 1
        AND upper(btrim(COALESCE(i.category_codes[1], ''))) IN ('GN', 'GENERAL')
      )
    )$old$, '');
  EXECUTE d;
END $patch$;

CREATE OR REPLACE FUNCTION public.get_stage_management_registrations_with_letters(
  p_schedule_id uuid DEFAULT NULL,p_festival_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(scoped)||pg_catalog.jsonb_build_object(
    'code_letter_fixed',r.code_letter_fixed,'entry_kind',r.entry_kind,
    'entry_chest_number',group_entry_private.chest_number(r),
    'group_leader_participant_id',r.group_leader_participant_id,
    'group_leader_profile_slug',(SELECT p.profile_slug FROM public.participants p WHERE p.id=r.group_leader_participant_id),
    'members',CASE WHEN r.entry_kind='general_team' THEN COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name',p.name,'chest_number',p.chest_number,
        'is_leader',p.id=r.group_leader_participant_id) ORDER BY gm.member_order NULLS LAST,p.name,p.id)
      FROM public.group_members gm JOIN public.participants p ON p.id=gm.participant_id
      WHERE gm.registration_id=r.id),'[]'::jsonb) ELSE '[]'::jsonb END)),'[]'::jsonb)
  FROM public.get_stage_management_registrations_scoped(p_schedule_id,p_festival_id) scoped
  JOIN public.registrations r ON r.id=scoped.id;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA group_entry_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.update_group_team_roster(uuid,uuid[],uuid[],uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_group_team_roster(uuid,uuid[],uuid[],uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
