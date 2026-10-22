-- Minimal pre-existing schema for a DISPOSABLE test database only.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated,anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
CREATE TABLE public.tenants(id uuid PRIMARY KEY,organisation_id uuid);
CREATE TABLE public.profiles(id uuid PRIMARY KEY,tenant_id uuid,role text,is_superadmin boolean DEFAULT false);
CREATE TABLE public.organisations(id uuid PRIMARY KEY,parent_id uuid,tenant_id uuid,name text,created_at timestamptz DEFAULT now());
CREATE TABLE public.festival_calendar(id uuid PRIMARY KEY,tenant_id uuid,chest_number_template text,chest_number_category_range integer);
CREATE TABLE public.festival_team_chest_slots(
  festival_id uuid REFERENCES public.festival_calendar ON DELETE CASCADE,
  organisation_id uuid REFERENCES public.organisations ON DELETE CASCADE,
  slot_number integer CHECK(slot_number>0),PRIMARY KEY(festival_id,organisation_id),UNIQUE(festival_id,slot_number));
CREATE TABLE public.participants(id uuid PRIMARY KEY,festival_id uuid,tenant_id uuid,organisation_id uuid,chest_number text,name text,category_code text,UNIQUE(festival_id,chest_number));
CREATE TABLE public.festival_categories(festival_id uuid,code text,sort_order integer);
CREATE TABLE public.chest_number_regeneration_audits(tenant_id uuid,festival_id uuid,category_range integer,participant_count integer,regenerated_by uuid,chest_number_template text);
CREATE TABLE public.participant_chest_number_changes(tenant_id uuid,festival_id uuid,participant_id uuid,old_chest_number text,new_chest_number text,old_organisation_id uuid,new_organisation_id uuid,changed_by uuid);
CREATE SCHEMA group_entry_private;
CREATE TABLE public.registrations(id uuid PRIMARY KEY,festival_id uuid,entry_kind text,entry_chest_number text);
INSERT INTO public.registrations VALUES ('00000000-0000-4000-8000-000000000301','00000000-0000-4000-8000-000000000011','general_team','5000');
INSERT INTO public.tenants VALUES ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010');
INSERT INTO public.profiles VALUES
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000001','admin',false),
 ('00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000002','admin',false),
 ('00000000-0000-4000-8000-000000000103','00000000-0000-4000-8000-000000000001','team_leader',false);
INSERT INTO public.festival_calendar VALUES ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','team',100);
INSERT INTO public.organisations(id,parent_id,tenant_id,name) VALUES
 ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','Team A'),
 ('00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','Team B'),
 ('00000000-0000-4000-8000-000000000023','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','Team C');
INSERT INTO public.festival_team_chest_slots VALUES
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000021',1),
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000022',2),
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000023',3);
INSERT INTO public.participants VALUES
 ('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000021','100','Student One','HS'),
 ('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000021','101','Student Two','HS'),
 ('00000000-0000-4000-8000-000000000203','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000022','200','Student Three','HS');
-- Existing inconsistent legacy data exercises rollback after slot reordering.
INSERT INTO public.festival_calendar VALUES
 ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001','team',100),
 ('00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000001','team',100);
INSERT INTO public.festival_team_chest_slots
 SELECT f.id,s.organisation_id,s.slot_number FROM public.festival_calendar f
 CROSS JOIN public.festival_team_chest_slots s
 WHERE f.id IN ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000013')
 AND s.festival_id='00000000-0000-4000-8000-000000000011';
INSERT INTO public.participants
 SELECT ('00000000-0000-4000-8100-'||lpad(n::text,12,'0'))::uuid,
 '00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001',
 '00000000-0000-4000-8000-000000000021',(100+n)::text,'Legacy Student '||n,'HS'
 FROM generate_series(0,100) n;
