BEGIN;

-- This table is an unforgeable, transaction-scoped capability used only by
-- the SECURITY DEFINER delete RPC and the roster guard below.
CREATE TABLE IF NOT EXISTS group_entry_private.registration_delete_authorizations (
  transaction_id bigint NOT NULL,
  registration_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  PRIMARY KEY (transaction_id, registration_id)
);
REVOKE ALL ON TABLE group_entry_private.registration_delete_authorizations FROM PUBLIC, anon, authenticated;

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
      IF NOT EXISTS (
        SELECT 1 FROM public.items i
        JOIN public.participants p ON p.id=NEW.participant_id
        WHERE i.id=entry.item_id AND (
          EXISTS (SELECT 1 FROM unnest(COALESCE(i.category_codes, ARRAY[]::text[])) c(code)
            WHERE upper(btrim(c.code)) IN ('GN','GENERAL'))
          AND upper(btrim(COALESCE(p.category_code,''))) NOT IN ('GN','GENERAL')
          OR EXISTS (SELECT 1 FROM unnest(COALESCE(i.category_codes, ARRAY[]::text[])) c(code)
            WHERE upper(btrim(c.code)) IN (upper(btrim(COALESCE(p.category_code,''))),
              CASE upper(btrim(COALESCE(p.category_code,''))) WHEN 'JUNIOR' THEN 'JR' WHEN 'JR' THEN 'JUNIOR'
                WHEN 'SENIOR' THEN 'SR' WHEN 'SR' THEN 'SENIOR' WHEN 'CAMPUS' THEN 'CA' WHEN 'CA' THEN 'CAMPUS'
                ELSE upper(btrim(COALESCE(p.category_code,''))) END))
        ) AND (COALESCE(lower(btrim(i.gender)),'both') IN ('','both')
          OR lower(btrim(i.gender))=lower(btrim(COALESCE(p.gender,''))))
      ) THEN
        RAISE EXCEPTION 'The participant does not meet this group program eligibility.' USING ERRCODE='23514';
      END IF;
    END IF;
    -- Older tenants store the same identity in group_leader_participant_id.
    -- Read the row as JSON so this guard remains compatible across both schemas.
    IF TG_OP='DELETE' AND OLD.participant_id=COALESCE(
      NULLIF(to_jsonb(entry)->>'group_representative_id','')::uuid,
      NULLIF(to_jsonb(entry)->>'group_leader_participant_id','')::uuid
    ) AND NOT EXISTS (
      SELECT 1 FROM group_entry_private.registration_delete_authorizations authz
      WHERE authz.transaction_id=pg_catalog.txid_current()
        AND authz.registration_id=entry.id
        AND authz.actor_id=auth.uid()
    ) THEN
      RAISE EXCEPTION 'The representative cannot be removed from the group roster.' USING ERRCODE='23514';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.safe_delete_general_team_entry(
  p_registration_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_registration public.registrations%ROWTYPE;
  v_festival public.festival_calendar%ROWTYPE;
  v_organisation public.organisations%ROWTYPE;
  v_item_code text;
  v_dependencies jsonb := '[]'::jsonb;
  v_snapshot jsonb;
  v_auth_transaction_id bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid();
  IF NOT FOUND OR (v_actor.is_superadmin IS NOT TRUE
      AND v_actor.role IS DISTINCT FROM 'admin'
      AND v_actor.role IS DISTINCT FROM 'admin_leader') THEN
    RAISE EXCEPTION 'Only festival administrators can delete a group entry.' USING ERRCODE='42501';
  END IF;

  SELECT r.* INTO v_registration
  FROM public.registrations r WHERE r.id=p_registration_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','not_found','registration_id',p_registration_id);
  END IF;
  IF v_registration.entry_kind IS DISTINCT FROM 'general_team'
     OR v_registration.is_group_registration IS NOT TRUE
     OR v_registration.participant_id IS NOT NULL THEN
    RAISE EXCEPTION 'This operation only deletes General group entries.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_festival FROM public.festival_calendar f WHERE f.id=v_registration.festival_id;
  SELECT * INTO v_organisation FROM public.organisations o WHERE o.id=v_registration.organisation_id;
  IF NOT FOUND OR v_festival.id IS NULL OR v_organisation.id IS NULL
     OR v_organisation.tenant_id IS DISTINCT FROM v_registration.tenant_id THEN
    RETURN jsonb_build_object('status','not_found','registration_id',p_registration_id);
  END IF;
  IF v_actor.is_superadmin IS NOT TRUE AND (
      v_actor.tenant_id IS DISTINCT FROM v_festival.tenant_id
      OR NOT public.is_org_visible(v_registration.organisation_id)
  ) THEN
    RAISE EXCEPTION 'Permission denied for this group entry.' USING ERRCODE='42501';
  END IF;

  SELECT i.item_code INTO v_item_code FROM public.items i
  WHERE i.id=v_registration.item_id AND i.festival_id=v_registration.festival_id;

  IF EXISTS (SELECT 1 FROM public.mark_entries me WHERE me.registration_id=v_registration.id) THEN
    v_dependencies := v_dependencies || jsonb_build_array('judge_marks');
  END IF;
  IF EXISTS (SELECT 1 FROM public.results result WHERE result.registration_id=v_registration.id) THEN
    v_dependencies := v_dependencies || jsonb_build_array('results_or_points');
  END IF;
  IF v_registration.is_verified IS TRUE OR v_registration.code_letter_fixed IS TRUE
     OR NULLIF(btrim(COALESCE(v_registration.code_letter,'')),'') IS NOT NULL THEN
    v_dependencies := v_dependencies || jsonb_build_array('check_in_or_code_letter');
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.attendance attendance
    JOIN public.schedules schedule ON schedule.id=attendance.schedule_id
    JOIN public.group_members member ON member.participant_id=attendance.participant_id
    WHERE member.registration_id=v_registration.id
      AND schedule.item_id=v_registration.item_id
      AND schedule.festival_id=v_registration.festival_id
  ) THEN
    v_dependencies := v_dependencies || jsonb_build_array('member_attendance');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.certificates certificate
    JOIN public.group_members member ON member.participant_id=certificate.participant_id
    WHERE member.registration_id=v_registration.id AND certificate.item_id=v_registration.item_id
  ) THEN
    v_dependencies := v_dependencies || jsonb_build_array('member_certificates');
  END IF;

  IF jsonb_array_length(v_dependencies)>0 THEN
    INSERT INTO public.audit_logs(tenant_id,user_id,action,table_name,record_id,old_value,new_value)
    VALUES(v_registration.tenant_id,auth.uid(),'GROUP_ENTRY_DELETE_BLOCKED','registrations',v_registration.id,
      to_jsonb(v_registration),jsonb_build_object('status','blocked','reason',NULLIF(btrim(p_reason),''),'dependencies',v_dependencies));
    RETURN jsonb_build_object('status','blocked',
      'message',format('This group entry cannot be deleted because history exists: %s. Nothing was deleted.',
        array_to_string(ARRAY(SELECT jsonb_array_elements_text(v_dependencies)),', ')),
      'registration_id',v_registration.id,'dependencies',v_dependencies);
  END IF;

  SELECT to_jsonb(v_registration) || jsonb_build_object(
      'members',COALESCE(jsonb_agg(jsonb_build_object(
        'participant_id',participant.id,'name',participant.name,'chest_number',participant.chest_number
      ) ORDER BY participant.id) FILTER (WHERE participant.id IS NOT NULL),'[]'::jsonb))
  INTO v_snapshot
  FROM public.group_members member
  JOIN public.participants participant ON participant.id=member.participant_id
  WHERE member.registration_id=v_registration.id;

  v_auth_transaction_id:=pg_catalog.txid_current();
  INSERT INTO group_entry_private.registration_delete_authorizations(transaction_id,registration_id,actor_id)
  VALUES(v_auth_transaction_id,v_registration.id,auth.uid());

  BEGIN
    DELETE FROM public.group_members member WHERE member.registration_id=v_registration.id;
    DELETE FROM public.registrations registration WHERE registration.id=v_registration.id;
  EXCEPTION WHEN foreign_key_violation THEN
    DELETE FROM group_entry_private.registration_delete_authorizations
    WHERE transaction_id=v_auth_transaction_id AND registration_id=v_registration.id AND actor_id=auth.uid();
    INSERT INTO public.audit_logs(tenant_id,user_id,action,table_name,record_id,old_value,new_value)
    VALUES(v_registration.tenant_id,auth.uid(),'GROUP_ENTRY_DELETE_BLOCKED','registrations',v_registration.id,
      v_snapshot,jsonb_build_object('status','blocked','reason',NULLIF(btrim(p_reason),''),'database_constraint','dependent_history'));
    RETURN jsonb_build_object('status','blocked',
      'message','This group entry has linked history that prevents deletion. Nothing was deleted.',
      'registration_id',v_registration.id);
  END;

  DELETE FROM group_entry_private.registration_delete_authorizations
  WHERE transaction_id=v_auth_transaction_id AND registration_id=v_registration.id AND actor_id=auth.uid();

  INSERT INTO public.audit_logs(tenant_id,user_id,action,table_name,record_id,old_value,new_value)
  VALUES(v_registration.tenant_id,auth.uid(),'GROUP_ENTRY_DELETE','registrations',v_registration.id,
    v_snapshot,jsonb_build_object('status','removed','reason',NULLIF(btrim(p_reason),''),
      'tenant_id',v_registration.tenant_id,'festival_id',v_registration.festival_id,
      'item_id',v_registration.item_id,'organisation_id',v_registration.organisation_id,
      'deleted_by',auth.uid(),'deleted_at',pg_catalog.now()));

  RETURN jsonb_build_object('status','removed','registration_id',v_registration.id,
    'festival_id',v_registration.festival_id,'item_id',v_registration.item_id,
    'organisation_id',v_registration.organisation_id);
END;
$$;

REVOKE ALL ON FUNCTION public.safe_delete_general_team_entry(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.safe_delete_general_team_entry(uuid,text) TO authenticated;

COMMIT;
