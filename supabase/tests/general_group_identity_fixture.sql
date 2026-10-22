-- Disposable contract fixture; no production connection or real user data.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA test;
CREATE FUNCTION test.id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT lpad(n::text,32,'0')::uuid $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
CREATE TABLE profiles(id uuid PRIMARY KEY,tenant_id uuid,role text,is_superadmin boolean DEFAULT false);
CREATE TABLE festival_calendar(id uuid PRIMARY KEY,tenant_id uuid,is_active boolean DEFAULT true,general_category_enabled boolean DEFAULT true,
 chest_number_category_range integer DEFAULT 100,level text DEFAULT 'unit',festival_year integer DEFAULT 2026,start_date date);
CREATE TABLE organisations(id uuid PRIMARY KEY,tenant_id uuid,name text,org_type text);
CREATE TABLE participants(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,festival_id uuid,organisation_id uuid,
 name text,chest_number text,category_code text DEFAULT 'HS',status text DEFAULT 'approved',gender text DEFAULT 'male',
 profile_slug text,profile_bio text,photo_url text,public_profile_enabled boolean DEFAULT true,show_organisation_public boolean DEFAULT true,
 UNIQUE(festival_id,chest_number));
CREATE TABLE items(id uuid PRIMARY KEY,tenant_id uuid,festival_id uuid,item_code text,item_name_en text,item_name_ml text,
 participation_type text DEFAULT 'group',category_codes text[] DEFAULT '{GN}',is_active boolean DEFAULT true,
 group_min_members integer DEFAULT 2,group_max_members integer DEFAULT 3,gender text DEFAULT 'both');
CREATE TABLE registrations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,festival_id uuid,item_id uuid,participant_id uuid,
 organisation_id uuid,status text DEFAULT 'approved',is_group_registration boolean DEFAULT false,entry_kind text DEFAULT 'participant',
 entry_chest_number text,raw_group_members jsonb,is_verified boolean DEFAULT false,code_letter text,code_letter_fixed boolean DEFAULT false,
 CHECK(entry_kind<>'general_team' OR (participant_id IS NULL AND organisation_id IS NOT NULL)));
CREATE UNIQUE INDEX registrations_general_entry_chest_unique ON registrations(festival_id,entry_chest_number) WHERE entry_kind='general_team' AND entry_chest_number IS NOT NULL;
CREATE TABLE group_members(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),registration_id uuid REFERENCES registrations,participant_id uuid REFERENCES participants);
CREATE TABLE general_entry_number_counters(tenant_id uuid,festival_id uuid PRIMARY KEY,next_number bigint DEFAULT 1);
CREATE TABLE results(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),registration_id uuid,item_id uuid,festival_id uuid,rank integer,grade text,
 points_awarded integer,published boolean,result_status text,public_visible boolean,published_at timestamptz,public_result_no integer);
CREATE TABLE mark_entries(registration_id uuid);
CREATE TABLE attendance(participant_id uuid,schedule_id uuid);
CREATE TABLE schedules(id uuid PRIMARY KEY,tenant_id uuid,festival_id uuid,item_id uuid,is_shuffle_locked boolean DEFAULT false);
CREATE TABLE audit_logs(tenant_id uuid,user_id uuid,action text,table_name text,record_id uuid,old_value jsonb,new_value jsonb);
CREATE TABLE festival_leaderboard_settings(festival_id uuid,is_public_visible boolean);
CREATE FUNCTION public.get_my_tenant_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT tenant_id FROM profiles WHERE id=auth.uid() $$;
CREATE FUNCTION public.stage_assert_admin_access() RETURNS uuid LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 RETURN public.get_my_tenant_id(); END $$;
CREATE FUNCTION public.get_visible_organisations(t uuid) RETURNS TABLE(id uuid,tenant_id uuid) LANGUAGE sql STABLE AS $$
 SELECT id,tenant_id FROM organisations WHERE tenant_id=t $$;
CREATE FUNCTION public.get_team_leader_context() RETURNS TABLE(parent_tenant_id uuid,festival_id uuid,organisation_id uuid)
 LANGUAGE plpgsql STABLE AS $$ BEGIN
 IF auth.uid()<>test.id(92) THEN RAISE EXCEPTION 'Team Leader access required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT test.id(1),test.id(11),test.id(21); END $$;
CREATE FUNCTION test.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; RAISE NOTICE 'PASS: %',label; END $$;
CREATE FUNCTION test.denied(statement text,label text,expected_state text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN
 IF SQLSTATE<>expected_state THEN RAISE; END IF;
 RAISE NOTICE 'PASS: %',label; RETURN; END;
 RAISE EXCEPTION 'FAIL: %',label; END $$;

INSERT INTO profiles VALUES(test.id(91),test.id(1),'admin',false),(test.id(92),test.id(1),'team_leader',false),(test.id(93),test.id(2),'admin',false);
INSERT INTO festival_calendar(id,tenant_id,chest_number_category_range) VALUES(test.id(11),test.id(1),100),(test.id(12),test.id(1),1000),(test.id(13),test.id(2),100);
INSERT INTO organisations VALUES(test.id(21),test.id(1),'Team A','unit'),(test.id(22),test.id(1),'Team B','unit'),(test.id(23),test.id(2),'Other tenant','unit');
INSERT INTO participants(id,tenant_id,festival_id,organisation_id,name,chest_number,profile_slug) VALUES
 (test.id(31),test.id(1),test.id(11),test.id(21),'Amina','101','amina'),
 (test.id(32),test.id(1),test.id(11),test.id(21),'Hana','102','hana'),
 (test.id(33),test.id(1),test.id(11),test.id(22),'Same festival other team','103','other-team'),
 (test.id(34),test.id(2),test.id(13),test.id(23),'Other tenant child','101','other-tenant'),
 (test.id(35),test.id(1),test.id(12),test.id(21),'Other range child','1000','other-range'),
 (test.id(36),test.id(1),test.id(11),test.id(21),'Existing numeric collision','1000','occupied');
INSERT INTO items(id,tenant_id,festival_id,item_code,item_name_en) VALUES
 (test.id(41),test.id(1),test.id(11),'TRL','General group competition'),(test.id(43),test.id(1),test.id(12),'G2','Other group');
INSERT INTO items(id,tenant_id,festival_id,item_code,item_name_en,participation_type,category_codes) VALUES(test.id(42),test.id(1),test.id(11),'S1','Solo competition','individual','{HS}');
UPDATE items SET group_min_members=1 WHERE id=test.id(43);
INSERT INTO registrations(id,tenant_id,festival_id,item_id,participant_id,organisation_id) VALUES(test.id(61),test.id(1),test.id(11),test.id(42),test.id(31),test.id(21));
INSERT INTO registrations(id,tenant_id,festival_id,item_id,organisation_id,is_group_registration,entry_kind,entry_chest_number)
 VALUES(test.id(62),test.id(1),test.id(11),test.id(41),test.id(21),true,'general_team','GE-00001');
INSERT INTO group_members(registration_id,participant_id) VALUES(test.id(62),test.id(31)),(test.id(62),test.id(32));
INSERT INTO results(registration_id,item_id,festival_id,rank,grade,points_awarded,published,result_status,public_visible,published_at,public_result_no)
 VALUES(test.id(61),test.id(42),test.id(11),1,'A',5,true,'published',true,now(),1),
 (test.id(62),test.id(41),test.id(11),1,'A',50,true,'published',true,now(),2);
INSERT INTO schedules VALUES(test.id(51),test.id(1),test.id(11),test.id(41),false);
INSERT INTO festival_leaderboard_settings VALUES(test.id(11),true);
ALTER TABLE organisations ADD COLUMN parent_id uuid;
ALTER TABLE festival_leaderboard_settings ADD COLUMN ranking_mode text DEFAULT 'ALL', ADD COLUMN item_limit integer;
CREATE TABLE points_config(festival_id uuid,enable_grace_marks boolean,config_version integer);
CREATE TABLE grace_marks(festival_id uuid,org_id uuid,points integer);
