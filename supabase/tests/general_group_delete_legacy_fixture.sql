-- Isolated PostgreSQL contract fixture for a legacy tenant schema.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA group_entry_private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
CREATE TABLE public.profiles(id uuid PRIMARY KEY,tenant_id uuid,role text,is_superadmin boolean DEFAULT false);
CREATE TABLE public.festival_calendar(id uuid PRIMARY KEY,tenant_id uuid);
CREATE TABLE public.organisations(id uuid PRIMARY KEY,tenant_id uuid);
CREATE TABLE public.participants(id uuid PRIMARY KEY,name text,chest_number text);
CREATE TABLE public.items(id uuid PRIMARY KEY,festival_id uuid,item_code text);
CREATE TABLE public.registrations(
  id uuid PRIMARY KEY,tenant_id uuid,festival_id uuid,item_id uuid,participant_id uuid,organisation_id uuid,
  status text,entry_kind text,is_group_registration boolean,entry_chest_number text,is_verified boolean,
  code_letter text,code_letter_fixed boolean,group_leader_participant_id uuid REFERENCES public.participants(id)
);
CREATE TABLE public.group_members(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),registration_id uuid REFERENCES public.registrations(id),participant_id uuid REFERENCES public.participants(id));
CREATE TABLE public.results(registration_id uuid);
CREATE TABLE public.mark_entries(registration_id uuid);
CREATE TABLE public.schedules(id uuid PRIMARY KEY,item_id uuid,festival_id uuid);
CREATE TABLE public.attendance(schedule_id uuid,participant_id uuid);
CREATE TABLE public.certificates(participant_id uuid,item_id uuid);
CREATE TABLE public.audit_logs(tenant_id uuid,user_id uuid,action text,table_name text,record_id uuid,old_value jsonb,new_value jsonb);
CREATE FUNCTION public.is_org_visible(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
INSERT INTO public.profiles VALUES('00000000-0000-0000-0000-000000000091','00000000-0000-0000-0000-000000000001','admin',false);
INSERT INTO public.festival_calendar VALUES('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001');
INSERT INTO public.organisations VALUES('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000001');
INSERT INTO public.items VALUES('00000000-0000-0000-0000-000000000041','00000000-0000-0000-0000-000000000011','OLD');
INSERT INTO public.participants VALUES
 ('00000000-0000-0000-0000-000000000031','Member one','101'),
 ('00000000-0000-0000-0000-000000000032','Member two','102');
INSERT INTO public.registrations VALUES
 ('00000000-0000-0000-0000-000000000071','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000041',NULL,'00000000-0000-0000-0000-000000000021','approved','general_team',true,
  '101',false,NULL,false,'00000000-0000-0000-0000-000000000031');
INSERT INTO public.group_members(registration_id,participant_id) VALUES
 ('00000000-0000-0000-0000-000000000071','00000000-0000-0000-0000-000000000031'),
 ('00000000-0000-0000-0000-000000000071','00000000-0000-0000-0000-000000000032');
