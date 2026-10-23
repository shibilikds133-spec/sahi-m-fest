BEGIN;

CREATE OR REPLACE FUNCTION public.safe_delete_participants(
  p_participant_ids uuid[],
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_participant public.participants%ROWTYPE;
  v_participant_ids uuid[];
  v_count integer;
  v_registration_id uuid;
  v_group_result jsonb;
  v_block_message text;
  v_block_dependencies jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid();
  IF NOT FOUND OR (v_actor.is_superadmin IS NOT TRUE
      AND v_actor.role IS DISTINCT FROM 'admin'
      AND v_actor.role IS DISTINCT FROM 'admin_leader') THEN
    RAISE EXCEPTION 'Only festival administrators can delete participants.' USING ERRCODE='42501';
  END IF;

  SELECT COALESCE(array_agg(id ORDER BY id), ARRAY[]::uuid[])
    INTO v_participant_ids
  FROM (SELECT DISTINCT unnest(COALESCE(p_participant_ids, ARRAY[]::uuid[])) AS id) requested;

  IF cardinality(v_participant_ids)=0 THEN
    RETURN jsonb_build_object('status','removed','deleted_count',0,'participant_ids','[]'::jsonb);
  END IF;

  -- Lock in a stable order. The all-or-nothing bulk operation must not race
  -- roster edits or another deletion of the same participants.
  PERFORM participant.id
  FROM public.participants participant
  WHERE participant.id=ANY(v_participant_ids)
  ORDER BY participant.id
  FOR UPDATE;

  SELECT count(*) INTO v_count
  FROM public.participants participant
  WHERE participant.id=ANY(v_participant_ids)
    AND (v_actor.is_superadmin IS TRUE OR (
      participant.tenant_id=v_actor.tenant_id
      AND public.is_org_visible(participant.organisation_id)
    ));

  IF v_count <> cardinality(v_participant_ids) THEN
    RAISE EXCEPTION 'One or more participants were not found or are outside your organisation.' USING ERRCODE='42501';
  END IF;

  v_block_dependencies := '[]'::jsonb;
  IF EXISTS (SELECT 1 FROM public.registrations registration
      WHERE registration.participant_id=ANY(v_participant_ids)) THEN
    v_block_dependencies := v_block_dependencies || jsonb_build_array('individual_competition_registrations');
  END IF;
  IF EXISTS (SELECT 1 FROM public.attendance attendance
      WHERE attendance.participant_id=ANY(v_participant_ids)) THEN
    v_block_dependencies := v_block_dependencies || jsonb_build_array('attendance_or_check_in');
  END IF;
  IF EXISTS (SELECT 1 FROM public.certificates certificate
      WHERE certificate.participant_id=ANY(v_participant_ids)) THEN
    v_block_dependencies := v_block_dependencies || jsonb_build_array('certificates');
  END IF;
  IF EXISTS (SELECT 1 FROM public.participant_chest_number_changes change_log
      WHERE change_log.participant_id=ANY(v_participant_ids)) THEN
    v_block_dependencies := v_block_dependencies || jsonb_build_array('chest_number_change_history');
  END IF;
  IF EXISTS (SELECT 1 FROM public.participant_unit_audit_logs audit_log
      WHERE audit_log.participant_id=ANY(v_participant_ids)) THEN
    v_block_dependencies := v_block_dependencies || jsonb_build_array('organisation_transfer_history');
  END IF;

  IF jsonb_array_length(v_block_dependencies)>0 THEN
    FOR v_participant IN SELECT * FROM public.participants WHERE id=ANY(v_participant_ids) ORDER BY id LOOP
      INSERT INTO public.audit_logs(tenant_id,user_id,action,table_name,record_id,old_value,new_value)
      VALUES(v_participant.tenant_id,auth.uid(),'PARTICIPANT_DELETE_BLOCKED','participants',v_participant.id,
        to_jsonb(v_participant),jsonb_build_object('status','blocked',
          'reason',NULLIF(btrim(p_reason),''),'dependencies',v_block_dependencies));
    END LOOP;
    RETURN jsonb_build_object('status','blocked',
      'message',format('Participant deletion is blocked because history or individual registrations exist: %s. Nothing was deleted.',
        array_to_string(ARRAY(SELECT jsonb_array_elements_text(v_block_dependencies)),', ')),
      'participant_ids',to_jsonb(v_participant_ids),'dependencies',v_block_dependencies);
  END IF;

  -- Group removals and participant deletion share one subtransaction. The
  -- existing group RPC remains the authority for marks/results/check-in and
  -- other protected group history. A blocked group rolls the whole batch back.
  BEGIN
    FOR v_registration_id IN
      SELECT registration.id
      FROM public.registrations registration
      WHERE registration.entry_kind='general_team'
        AND (EXISTS (SELECT 1 FROM public.group_members member
              WHERE member.registration_id=registration.id
                AND member.participant_id=ANY(v_participant_ids))
          OR NULLIF(to_jsonb(registration)->>'group_leader_participant_id','')::uuid=ANY(v_participant_ids)
          OR NULLIF(to_jsonb(registration)->>'group_representative_id','')::uuid=ANY(v_participant_ids))
      ORDER BY registration.id
      FOR UPDATE OF registration
    LOOP
      v_group_result:=public.safe_delete_general_team_entry(v_registration_id,p_reason);
      IF v_group_result->>'status' IS DISTINCT FROM 'removed' THEN
        v_block_message:=COALESCE(v_group_result->>'message','A related group entry could not be safely removed.');
        RAISE EXCEPTION 'Participant group deletion blocked' USING ERRCODE='ZX001';
      END IF;
    END LOOP;

    -- Capture the row before removing it so the participant's admin audit is
    -- durable even after the participant no longer exists.
    FOR v_participant IN SELECT * FROM public.participants WHERE id=ANY(v_participant_ids) ORDER BY id LOOP
      INSERT INTO public.audit_logs(tenant_id,user_id,action,table_name,record_id,old_value,new_value)
      VALUES(v_participant.tenant_id,auth.uid(),'PARTICIPANT_DELETE','participants',v_participant.id,
        to_jsonb(v_participant),jsonb_build_object('status','removed',
          'reason',NULLIF(btrim(p_reason),''),'deleted_by',auth.uid(),'deleted_at',pg_catalog.now()));
    END LOOP;

    DELETE FROM public.participants participant WHERE participant.id=ANY(v_participant_ids);
  EXCEPTION WHEN SQLSTATE 'ZX001' THEN
    -- Any earlier group removals and their audit rows in this batch are
    -- rolled back with this block. Record only the participant-level block.
    FOR v_participant IN SELECT * FROM public.participants WHERE id=ANY(v_participant_ids) ORDER BY id LOOP
      INSERT INTO public.audit_logs(tenant_id,user_id,action,table_name,record_id,old_value,new_value)
      VALUES(v_participant.tenant_id,auth.uid(),'PARTICIPANT_DELETE_BLOCKED','participants',v_participant.id,
        to_jsonb(v_participant),jsonb_build_object('status','blocked',
          'reason',NULLIF(btrim(p_reason),''),'group_entry_message',v_block_message));
    END LOOP;
    RETURN jsonb_build_object('status','blocked','message',v_block_message,
      'participant_ids',to_jsonb(v_participant_ids));
  WHEN foreign_key_violation THEN
    FOR v_participant IN SELECT * FROM public.participants WHERE id=ANY(v_participant_ids) ORDER BY id LOOP
      INSERT INTO public.audit_logs(tenant_id,user_id,action,table_name,record_id,old_value,new_value)
      VALUES(v_participant.tenant_id,auth.uid(),'PARTICIPANT_DELETE_BLOCKED','participants',v_participant.id,
        to_jsonb(v_participant),jsonb_build_object('status','blocked',
          'reason',NULLIF(btrim(p_reason),''),'dependencies','["linked_history"]'::jsonb));
    END LOOP;
    RETURN jsonb_build_object('status','blocked',
      'message','Participant deletion is blocked because linked history exists. Nothing was deleted.',
      'participant_ids',to_jsonb(v_participant_ids),'dependencies',jsonb_build_array('linked_history'));
  END;

  RETURN jsonb_build_object('status','removed','deleted_count',cardinality(v_participant_ids),
    'participant_ids',to_jsonb(v_participant_ids));
END;
$$;

REVOKE ALL ON FUNCTION public.safe_delete_participants(uuid[],text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.safe_delete_participants(uuid[],text) TO authenticated;

COMMIT;
