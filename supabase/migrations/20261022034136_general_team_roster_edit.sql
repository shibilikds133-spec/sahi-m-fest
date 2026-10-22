BEGIN;

-- A private, transaction-scoped capability lets only this validated admin RPC
-- change a roster after operational work has started. Direct member writes
-- keep the existing lock and validation behavior.
CREATE TABLE group_entry_private.member_edit_authorizations (
  transaction_id bigint PRIMARY KEY,
  registration_id uuid NOT NULL,
  actor_id uuid NOT NULL
);
REVOKE ALL ON group_entry_private.member_edit_authorizations FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION group_entry_private.guard_member() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE entry public.registrations; target uuid;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.registration_id,NEW.participant_id) IS NOT DISTINCT FROM (OLD.registration_id,OLD.participant_id) THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND NEW.registration_id IS DISTINCT FROM OLD.registration_id AND EXISTS(
    SELECT 1 FROM public.registrations WHERE id=OLD.registration_id AND entry_kind='general_team') THEN
    RAISE EXCEPTION 'Remove a membership before assigning it to another group.' USING ERRCODE='23514';
  END IF;
  target:=CASE WHEN TG_OP='DELETE' THEN OLD.registration_id ELSE NEW.registration_id END;
  SELECT * INTO entry FROM public.registrations WHERE id=target FOR UPDATE;
  IF entry.entry_kind='general_team' THEN
    IF (entry.is_verified IS TRUE OR entry.code_letter IS NOT NULL
      OR EXISTS(SELECT 1 FROM public.results WHERE registration_id=entry.id)
      OR EXISTS(SELECT 1 FROM public.mark_entries WHERE registration_id=entry.id))
      AND NOT EXISTS (
        SELECT 1 FROM group_entry_private.member_edit_authorizations permission
        WHERE permission.transaction_id=pg_catalog.txid_current()
          AND permission.registration_id=entry.id
          AND permission.actor_id=auth.uid()
      ) THEN
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

CREATE FUNCTION public.update_general_team_roster(
  p_registration_id uuid,
  p_participant_ids uuid[],
  p_expected_participant_ids uuid[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_entry public.registrations%ROWTYPE;
  v_item public.items%ROWTYPE;
  v_festival_tenant uuid;
  v_old_ids uuid[];
  v_expected_ids uuid[];
  v_new_ids uuid[];
  v_count integer;
  v_names jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid();
  IF NOT FOUND OR (v_actor.role IS DISTINCT FROM 'admin' AND v_actor.is_superadmin IS NOT TRUE) THEN
    RAISE EXCEPTION 'Only an administrator can edit a General team roster.' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_entry FROM public.registrations WHERE id=p_registration_id FOR UPDATE;
  IF NOT FOUND OR v_entry.entry_kind IS DISTINCT FROM 'general_team' THEN
    RAISE EXCEPTION 'General team entry not found.' USING ERRCODE='P0002';
  END IF;
  SELECT tenant_id INTO v_festival_tenant FROM public.festival_calendar WHERE id=v_entry.festival_id;
  IF v_festival_tenant IS NULL OR (v_actor.is_superadmin IS NOT TRUE
    AND v_actor.tenant_id IS DISTINCT FROM v_festival_tenant) THEN
    RAISE EXCEPTION 'This entry is outside your tenant.' USING ERRCODE='42501';
  END IF;
  IF v_actor.is_superadmin IS NOT TRUE AND NOT EXISTS (
    SELECT 1 FROM public.get_visible_organisations(v_actor.tenant_id) visible
    WHERE visible.id=v_entry.organisation_id
  ) THEN
    RAISE EXCEPTION 'This team is outside your organisation scope.' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_item FROM public.items WHERE id=v_entry.item_id
    AND festival_id=v_entry.festival_id AND tenant_id=v_festival_tenant;
  IF NOT FOUND OR v_item.participation_type IS DISTINCT FROM 'group'
    OR cardinality(v_item.category_codes) IS DISTINCT FROM 1
    OR upper(btrim(v_item.category_codes[1])) NOT IN ('GN','GENERAL') THEN
    RAISE EXCEPTION 'This entry no longer belongs to a General group competition.';
  END IF;

  SELECT COALESCE(array_agg(gm.participant_id ORDER BY gm.participant_id),ARRAY[]::uuid[])
    INTO v_old_ids FROM public.group_members gm WHERE gm.registration_id=v_entry.id;
  SELECT COALESCE(array_agg(id ORDER BY id),ARRAY[]::uuid[])
    INTO v_expected_ids FROM unnest(p_expected_participant_ids) ids(id);
  IF p_expected_participant_ids IS NULL OR v_expected_ids IS DISTINCT FROM v_old_ids THEN
    RAISE EXCEPTION 'This roster changed. Reload before saving.' USING ERRCODE='40001';
  END IF;
  IF p_participant_ids IS NULL OR cardinality(p_participant_ids)=0
    OR array_position(p_participant_ids,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Select the team members before saving.';
  END IF;
  v_count:=cardinality(p_participant_ids);
  IF (SELECT count(DISTINCT member_id) FROM unnest(p_participant_ids) ids(member_id))<>v_count THEN
    RAISE EXCEPTION 'A participant can only be selected once for this entry.';
  END IF;
  IF COALESCE(v_item.group_min_members,0)<1
    OR v_count<v_item.group_min_members
    OR (COALESCE(v_item.group_max_members,0)>0 AND v_count>v_item.group_max_members) THEN
    RAISE EXCEPTION 'The selected team size is outside this competition''s configured member range.';
  END IF;
  SELECT array_agg(id ORDER BY id) INTO v_new_ids FROM unnest(p_participant_ids) ids(id);
  IF v_new_ids=v_old_ids THEN
    RETURN jsonb_build_object('registration_id',v_entry.id,'entry_chest_number',v_entry.entry_chest_number,
      'member_count',v_count,'changed',false);
  END IF;

  IF (SELECT count(*) FROM public.participants p WHERE p.id=ANY(v_new_ids)
    AND p.festival_id=v_entry.festival_id AND p.organisation_id=v_entry.organisation_id
    AND p.status IS DISTINCT FROM 'rejected'
    AND upper(btrim(COALESCE(p.category_code,''))) NOT IN ('GN','GENERAL')
    AND (COALESCE(lower(btrim(v_item.gender)),'both') IN ('','both')
      OR lower(btrim(COALESCE(p.gender,'')))=lower(btrim(v_item.gender))))<>v_count THEN
    RAISE EXCEPTION 'All members must be eligible participants from this festival and team.';
  END IF;

  INSERT INTO group_entry_private.member_edit_authorizations(transaction_id,registration_id,actor_id)
    VALUES(pg_catalog.txid_current(),v_entry.id,auth.uid());
  DELETE FROM public.group_members gm WHERE gm.registration_id=v_entry.id
    AND NOT (gm.participant_id=ANY(v_new_ids));
  INSERT INTO public.group_members(registration_id,participant_id)
    SELECT v_entry.id, ids.member_id FROM unnest(v_new_ids) ids(member_id)
    WHERE NOT EXISTS(SELECT 1 FROM public.group_members gm
      WHERE gm.registration_id=v_entry.id AND gm.participant_id=ids.member_id);
  SELECT jsonb_agg(p.name ORDER BY p.chest_number NULLS LAST,p.name,p.id)
    INTO v_names FROM public.participants p WHERE p.id=ANY(v_new_ids);
  UPDATE public.registrations SET raw_group_members=v_names WHERE id=v_entry.id;
  DELETE FROM group_entry_private.member_edit_authorizations
    WHERE transaction_id=pg_catalog.txid_current();

  INSERT INTO public.audit_logs(tenant_id,user_id,action,table_name,record_id,old_value,new_value)
    VALUES(v_entry.tenant_id,auth.uid(),'general_team_roster_edit','registrations',v_entry.id,
      jsonb_build_object('member_ids',v_old_ids),jsonb_build_object('member_ids',v_new_ids));
  RETURN jsonb_build_object('registration_id',v_entry.id,'entry_chest_number',v_entry.entry_chest_number,
    'member_count',v_count,'changed',true);
END $$;

REVOKE ALL ON FUNCTION public.update_general_team_roster(uuid,uuid[],uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_general_team_roster(uuid,uuid[],uuid[]) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
