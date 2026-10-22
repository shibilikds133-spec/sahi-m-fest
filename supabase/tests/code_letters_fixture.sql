-- Minimal isolated contract fixture, NOT a replacement for full-schema staging QA.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA stage_portal_private;
CREATE SCHEMA realtime;
CREATE SCHEMA test;
CREATE TABLE public.schedules(id uuid PRIMARY KEY, tenant_id uuid, festival_id uuid, item_id uuid,
  venue_id uuid, start_time timestamptz, end_time timestamptz, is_shuffle_locked boolean DEFAULT false);
CREATE TABLE public.registrations(id uuid PRIMARY KEY, tenant_id uuid, festival_id uuid, item_id uuid,
  participant_id uuid, organisation_id uuid, status text DEFAULT 'approved', is_verified boolean DEFAULT true, code_letter text);
CREATE UNIQUE INDEX idx_unique_code_letter ON public.registrations(festival_id, item_id, code_letter)
  WHERE code_letter IS NOT NULL;
CREATE TABLE public.participants(id uuid PRIMARY KEY, organisation_id uuid);
CREATE TABLE public.group_members(registration_id uuid, participant_id uuid);
CREATE TABLE public.venues(id uuid PRIMARY KEY, tenant_id uuid, festival_id uuid);
CREATE TABLE public.audit_logs(tenant_id uuid, user_id uuid, action text, table_name text, record_id uuid, old_value jsonb, new_value jsonb);
CREATE TABLE test.visible_orgs(id uuid, tenant_id uuid, scope uuid);
CREATE TABLE test.notifications(payload jsonb, event text, topic text, private boolean);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-0000-0000-000000000099'::uuid $$;
CREATE FUNCTION public.stage_assert_admin_access() RETURNS uuid LANGUAGE plpgsql AS $$ BEGIN
  IF current_setting('test.role',true) IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN current_setting('test.tenant')::uuid;
END $$;
CREATE FUNCTION public.get_visible_organisations(t uuid) RETURNS TABLE(id uuid,tenant_id uuid)
LANGUAGE sql AS $$ SELECT id,tenant_id FROM test.visible_orgs WHERE scope=t $$;
CREATE FUNCTION stage_portal_private.assert_pin(v uuid,p text) RETURNS text LANGUAGE sql AS $$
  SELECT CASE WHEN p='1234' AND EXISTS(SELECT 1 FROM public.venues WHERE id=v) THEN NULL ELSE 'Incorrect PIN.' END $$;
CREATE FUNCTION realtime.send(payload jsonb,event text,topic text,private boolean) RETURNS void LANGUAGE sql AS $$
  INSERT INTO test.notifications VALUES(payload,event,topic,private) $$;
CREATE FUNCTION public.get_stage_management_registrations_scoped(p_schedule_id uuid,p_festival_id uuid)
RETURNS TABLE(id uuid,schedule_id uuid) LANGUAGE plpgsql SECURITY DEFINER AS $$ DECLARE tenant uuid; BEGIN
  tenant:=public.stage_assert_admin_access();
  RETURN QUERY SELECT r.id,s.id FROM public.registrations r JOIN public.schedules s ON s.item_id=r.item_id AND s.festival_id=r.festival_id
    WHERE s.tenant_id=tenant AND (s.id=p_schedule_id OR s.festival_id=p_festival_id);
END $$;
CREATE FUNCTION public.stage_venue_portal_data(v uuid,p text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN
  IF stage_portal_private.assert_pin(v,p) IS NOT NULL THEN RETURN '{"error":"Incorrect PIN."}'::jsonb; END IF;
  RETURN jsonb_build_object('registrations',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.registrations r
    JOIN public.schedules s ON s.item_id=r.item_id AND s.festival_id=r.festival_id WHERE s.venue_id=v));
END $$;
CREATE FUNCTION test.ok(condition boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF;
  RAISE NOTICE 'PASS: %',label;
END $$;
CREATE FUNCTION test.error(statement text,code text,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE=code THEN RAISE NOTICE 'PASS: %',label; RETURN; ELSE RAISE; END IF;
  END;
  RAISE EXCEPTION 'FAIL: % (expected SQLSTATE %)',label,code;
END $$;
