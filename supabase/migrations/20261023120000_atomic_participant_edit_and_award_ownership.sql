BEGIN;

-- Prevent a transfer/publication between backfill and trigger installation.
LOCK TABLE public.participants,public.registrations,public.results IN SHARE ROW EXCLUSIVE MODE;

-- Award ownership is independent of a participant's current team. This private
-- ledger does not change the sealed scoring payload or the public API shapes.
CREATE TABLE public.result_team_awards (
  result_id uuid PRIMARY KEY REFERENCES public.results(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE RESTRICT,
  first_awarded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.result_team_awards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.result_team_awards FROM PUBLIC, anon, authenticated;

-- Freeze the currently observable attribution, not an invented past transfer.
INSERT INTO public.result_team_awards(result_id,organisation_id,first_awarded_at)
SELECT res.id,COALESCE(reg.organisation_id,p.organisation_id),COALESCE(res.published_at,now())
FROM public.results res LEFT JOIN public.registrations reg ON reg.id=res.registration_id
LEFT JOIN public.participants p ON p.id=reg.participant_id
WHERE (res.published IS TRUE OR res.points_calculation IS NOT NULL OR res.points_awarded IS NOT NULL)
  AND COALESCE(reg.organisation_id,p.organisation_id) IS NOT NULL;

CREATE FUNCTION public.capture_result_team_award() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE team uuid;
BEGIN
  IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM public.result_team_awards WHERE result_id=NEW.id) AND
    (OLD.registration_id,OLD.item_id,OLD.festival_id) IS DISTINCT FROM (NEW.registration_id,NEW.item_id,NEW.festival_id) THEN
    RAISE EXCEPTION 'An awarded result identity cannot be reassigned.'; END IF;
  IF NEW.published IS NOT TRUE AND NEW.points_calculation IS NULL AND NEW.points_awarded IS NULL THEN RETURN NEW; END IF;
  -- Serialize actual publication with transfer; corrections keep first ownership.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(NEW.festival_id::text),pg_catalog.hashtext('participant-chest-number'));
  IF EXISTS(SELECT 1 FROM public.result_team_awards WHERE result_id=NEW.id) THEN RETURN NEW; END IF;
  SELECT COALESCE(r.organisation_id,p.organisation_id) INTO team
  FROM public.registrations r LEFT JOIN public.participants p ON p.id=r.participant_id
  WHERE r.id=NEW.registration_id AND r.festival_id=NEW.festival_id;
  IF team IS NULL THEN RAISE EXCEPTION 'A published result must have an owned registration team.'; END IF;
  INSERT INTO public.result_team_awards(result_id,organisation_id) VALUES(NEW.id,team)
    ON CONFLICT(result_id) DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.capture_result_team_award() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER capture_result_team_award AFTER INSERT OR UPDATE ON public.results
FOR EACH ROW EXECUTE FUNCTION public.capture_result_team_award();

-- Retain each installed reader's visibility, deduplication, limits, grace and
-- authorization rules. Join by result identity, with no per-result RPC/query.
-- Fail closed on an unfamiliar reader instead of silently missing a consumer.
DO $readers$
DECLARE proc record; definition text; patched text; source text; join_key text;
BEGIN
  FOR proc IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f' AND p.proname IN (
      'get_public_leaderboard','get_admin_leaderboard','get_leaderboard_preview',
      'get_public_published_results','get_admin_published_results','get_festival_results') LOOP
    definition:=pg_get_functiondef(proc.oid);
    IF position('COALESCE(reg.organisation_id, participant.organisation_id)' IN definition)=0 THEN CONTINUE; END IF;
    IF position('FROM deduped_results res' IN definition)>0 THEN
      source:='FROM deduped_results res'; join_key:='res.result_id';
    ELSIF position('FROM published_results res' IN definition)>0 THEN
      source:='FROM published_results res'; join_key:='res.id';
    ELSIF position('FROM results res' IN definition)>0 THEN
      source:='FROM results res'; join_key:='res.id';
    ELSE RAISE EXCEPTION 'Review award ownership reader % before applying migration.',proc.oid::regprocedure; END IF;
    patched:=replace(definition,source,source||' LEFT JOIN public.result_team_awards award ON award.result_id='||join_key);
    patched:=replace(patched,'COALESCE(reg.organisation_id, participant.organisation_id)',
      'COALESCE(award.organisation_id, reg.organisation_id, participant.organisation_id)');
    -- Grace-only teams must use the same frozen attribution as result totals.
    patched:=replace(patched,'LEFT JOIN public.registrations gr ON gr.id=dr.registration_id',
      'LEFT JOIN public.result_team_awards ga ON ga.result_id=dr.result_id LEFT JOIN public.registrations gr ON gr.id=dr.registration_id');
    patched:=replace(patched,'COALESCE(gr.organisation_id,gp.organisation_id)',
      'COALESCE(ga.organisation_id,gr.organisation_id,gp.organisation_id)');
    -- These result readers also return a tenant_id column. Qualify the existing
    -- organisation predicate so PostgreSQL cannot confuse it with that output
    -- variable. This preserves the original ownership predicate exactly.
    patched:=replace(patched,'SELECT id FROM organisations WHERE tenant_id',
      'SELECT owned_org.id FROM organisations owned_org WHERE owned_org.tenant_id');
    EXECUTE patched;
  END LOOP;
  FOR proc IN SELECT c.oid,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='v' AND c.relname IN('vw_public_results','vw_public_leaderboard') LOOP
    definition:=pg_get_viewdef(proc.oid,true);
    -- pg_get_viewdef qualifies/parenthesizes joins; inject at the results source.
    IF definition ~ 'COALESCE\(reg.organisation_id, participant.organisation_id\)' THEN
      patched:=replace(definition,'results res','results res LEFT JOIN public.result_team_awards award ON award.result_id=res.id');
      patched:=replace(patched,'COALESCE(reg.organisation_id, participant.organisation_id)',
        'COALESCE(award.organisation_id, reg.organisation_id, participant.organisation_id)');
      EXECUTE format('CREATE OR REPLACE VIEW public.%I AS %s',proc.relname,patched);
    END IF;
  END LOOP;
END $readers$;

DO $profile$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.get_public_candidate_profile(text)'::regprocedure) INTO definition;
  IF position('''id'', v_participant.id' IN definition)=0 THEN RAISE EXCEPTION 'Review public candidate profile shape before applying migration.'; END IF;
  definition:=replace(definition,'p.profile_slug,','p.profile_slug, p.festival_id,');
  EXECUTE replace(definition,'''id'', v_participant.id','''id'', v_participant.id, ''festival_id'', v_participant.festival_id');
END $profile$;

-- A team's result list follows award ownership as well as its totals.
DO $portal$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.get_team_leader_published_results()'::regprocedure) INTO definition;
  IF position('AND r.organisation_id = c.organisation_id' IN definition)=0 THEN RAISE EXCEPTION 'Review team result reader before applying migration.'; END IF;
  definition:=replace(definition,'FROM public.results res','FROM public.results res LEFT JOIN public.result_team_awards award ON award.result_id=res.id');
  -- Transfer may change participant/registration tenant to the subordinate
  -- team's tenant. Result owner + festival + frozen award still bound access.
  definition:=replace(definition,'r.tenant_id = c.parent_tenant_id','r.festival_id = c.festival_id');
  definition:=replace(definition,'p.tenant_id = c.parent_tenant_id','p.festival_id = c.festival_id');
  EXECUTE replace(definition,'AND r.organisation_id = c.organisation_id','AND COALESCE(award.organisation_id,r.organisation_id) = c.organisation_id');
END $portal$;

CREATE FUNCTION public.edit_participant_profile(
  p_participant_id uuid,p_updates jsonb,p_new_org_id uuid,p_chest_number text,
  p_expected_updated_at timestamptz,p_expected_org_id uuid,p_expected_chest_number text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE before public.participants; edited public.participants; f public.festival_calendar;
  target_team uuid; target_number integer; first_gap integer; old_number integer; slot integer; source_slot integer; initial_festival uuid;
  plan jsonb; originals jsonb; row record; new_number integer; team_changed boolean; numbering_changed boolean;
BEGIN
  SELECT * INTO before FROM public.participants WHERE id=p_participant_id;
  IF before.id IS NULL THEN RAISE EXCEPTION 'Participant not found.'; END IF;
  initial_festival:=before.festival_id;
  PERFORM public.assert_festival_chest_admin(before.festival_id);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(before.festival_id::text),pg_catalog.hashtext('participant-chest-number'));
  SELECT * INTO before FROM public.participants WHERE id=p_participant_id FOR UPDATE;
  IF before.id IS NULL OR before.festival_id IS DISTINCT FROM initial_festival THEN
    RAISE EXCEPTION 'Participant festival changed. Reload before saving.' USING ERRCODE='40001'; END IF;
  -- The owner check is repeated after taking the lock; never trust client IDs.
  PERFORM public.assert_festival_chest_admin(before.festival_id);
  IF before.updated_at IS DISTINCT FROM p_expected_updated_at OR before.organisation_id IS DISTINCT FROM p_expected_org_id
    OR before.chest_number IS DISTINCT FROM p_expected_chest_number THEN
    RAISE EXCEPTION 'Participant changed after opening. Reload before saving.' USING ERRCODE='40001'; END IF;
  IF before.is_locked IS TRUE THEN RAISE EXCEPTION 'Unlock this participant before editing.' USING ERRCODE='55000'; END IF;
  IF jsonb_typeof(p_updates) IS DISTINCT FROM 'object' OR EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_updates) k WHERE k NOT IN
      ('name','dob','category_code','class_std','education_type','gender','public_profile_enabled','show_organisation_public')) THEN
    RAISE EXCEPTION 'Unsupported participant edit fields.'; END IF;
  edited:=jsonb_populate_record(before,p_updates);
  edited.name:=btrim(edited.name);
  IF edited.name IS NULL OR edited.name='' THEN RAISE EXCEPTION 'Name is required.'; END IF;
  target_team:=COALESCE(p_new_org_id,before.organisation_id);
  team_changed:=target_team IS DISTINCT FROM before.organisation_id;
  SELECT * INTO f FROM public.festival_calendar WHERE id=before.festival_id;
  numbering_changed:=team_changed OR (nullif(btrim(p_chest_number),'') IS NOT NULL AND p_chest_number IS DISTINCT FROM before.chest_number);
  IF numbering_changed AND EXISTS(SELECT 1 FROM public.festival_chest_number_controls WHERE festival_id=f.id AND locked) THEN
    RAISE EXCEPTION 'Chest numbers are finally locked. Unlock before changing team or number.' USING ERRCODE='55000'; END IF;

  -- Build the whole numbering plan before any write. Keep numeric order; class
  -- and category are metadata, never a second ordering source of truth.
  IF numbering_changed AND f.chest_number_template='team' THEN
    IF NOT EXISTS(SELECT 1 FROM public.organisations o JOIN public.tenants t ON o.parent_id=t.organisation_id
      WHERE t.id=f.tenant_id AND o.id=target_team) THEN RAISE EXCEPTION 'Select a team under this festival organisation.'; END IF;
    slot:=public.festival_team_chest_slot(f.id,target_team);
    SELECT slot_number INTO source_slot FROM public.festival_team_chest_slots WHERE festival_id=f.id AND organisation_id=before.organisation_id;
    IF before.chest_number !~ '^[0-9]+$' OR before.chest_number IS NULL OR source_slot IS NULL THEN
      RAISE EXCEPTION 'Generate valid team chest numbers before reordering.'; END IF;
    old_number:=before.chest_number::integer;
    IF old_number<source_slot*f.chest_number_category_range OR old_number>=(source_slot+1)*f.chest_number_category_range THEN
      RAISE EXCEPTION 'Current chest number is outside the team range.'; END IF;
    IF nullif(btrim(p_chest_number),'') IS NOT NULL THEN
      IF p_chest_number !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Enter a numeric chest number.'; END IF;
      target_number:=p_chest_number::integer;
    ELSE
      SELECT n INTO target_number FROM generate_series(slot*f.chest_number_category_range,(slot+1)*f.chest_number_category_range-1) n
      WHERE NOT EXISTS(SELECT 1 FROM public.participants p WHERE p.festival_id=f.id AND p.id<>before.id AND p.chest_number=n::text)
      ORDER BY n LIMIT 1;
    END IF;
    IF target_number IS NULL OR target_number<slot*f.chest_number_category_range
      OR target_number>=(slot+1)*f.chest_number_category_range THEN RAISE EXCEPTION 'Choose a number inside the destination team range.'; END IF;
    -- Shift only the occupied run up to its first gap. An unused target never
    -- changes unrelated later numbers or incorrectly reports a full range.
    SELECT n INTO first_gap FROM generate_series(target_number,(slot+1)*f.chest_number_category_range-1) n
    WHERE NOT EXISTS(SELECT 1 FROM public.participants p WHERE p.festival_id=f.id AND p.organisation_id=target_team AND p.id<>before.id
      AND CASE WHEN p.chest_number ~ '^[0-9]+$' THEN p.chest_number::integer-
        CASE WHEN target_team=before.organisation_id AND p.chest_number::integer>old_number THEN 1 ELSE 0 END END=n)
    ORDER BY n LIMIT 1;
    IF first_gap IS NULL THEN RAISE EXCEPTION 'No room to shift chest numbers inside the destination team range.'; END IF;
    plan:='{}'::jsonb;
    FOR row IN SELECT p.* FROM public.participants p WHERE p.festival_id=f.id
      AND p.organisation_id IN(before.organisation_id,target_team) AND p.id<>before.id ORDER BY p.id FOR UPDATE LOOP
      IF row.chest_number IS NULL OR row.chest_number !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Generate valid team chest numbers before reordering.'; END IF;
      new_number:=row.chest_number::integer;
      IF row.organisation_id=before.organisation_id AND (new_number<source_slot*f.chest_number_category_range
        OR new_number>=(source_slot+1)*f.chest_number_category_range) THEN
        RAISE EXCEPTION 'A source team chest number is outside its range.'; END IF;
      IF row.organisation_id=target_team AND (new_number<slot*f.chest_number_category_range
        OR new_number>=(slot+1)*f.chest_number_category_range) THEN
        RAISE EXCEPTION 'A destination team chest number is outside its range.'; END IF;
      IF row.organisation_id=before.organisation_id AND new_number>old_number THEN new_number:=new_number-1; END IF;
      IF row.organisation_id=target_team AND new_number>=target_number AND new_number<first_gap THEN new_number:=new_number+1; END IF;
      IF row.organisation_id=target_team AND new_number>=(slot+1)*f.chest_number_category_range THEN
        RAISE EXCEPTION 'No room to shift chest numbers inside the destination team range.'; END IF;
      IF new_number::text IS DISTINCT FROM row.chest_number THEN plan:=plan||jsonb_build_object(row.id::text,new_number::text); END IF;
    END LOOP;
    plan:=plan||jsonb_build_object(before.id::text,target_number::text);
    SELECT jsonb_agg(to_jsonb(p)) INTO originals FROM public.participants p WHERE p.id::text IN(SELECT jsonb_object_keys(plan));
    -- Move old values out of the unique namespace. Existing audit triggers
    -- ignore these temporary values; record one final old -> new row below.
    UPDATE public.participants p SET chest_number='__regen__'||p.id::text WHERE p.id::text IN(SELECT jsonb_object_keys(plan));
  ELSIF NOT team_changed AND numbering_changed THEN
    RAISE EXCEPTION 'Individual number placement requires team-based numbering.';
  END IF;

  -- Apply the final profile name before the existing transfer's duplicate-name
  -- validation. A later failure still rolls this entire transaction back.
  UPDATE public.participants SET name=edited.name,dob=edited.dob,category_code=edited.category_code,
    class_std=edited.class_std,education_type=edited.education_type,gender=edited.gender,
    public_profile_enabled=edited.public_profile_enabled,show_organisation_public=edited.show_organisation_public,
    updated_at=clock_timestamp() WHERE id=before.id;
  IF team_changed THEN
    -- Existing RPC keeps solo registrations/audit and leaves group entries with
    -- their original team. Historical awards are frozen by result_team_awards.
    PERFORM public.transfer_participant_team(before.id,target_team,auth.uid());
  END IF;
  IF plan IS NOT NULL THEN
    -- Transfer's legacy allocator may have chosen a temporary free number.
    UPDATE public.participants SET chest_number='__regen__'||id::text WHERE id=before.id;
    UPDATE public.participants p SET chest_number=e.value,updated_at=clock_timestamp()
      FROM jsonb_each_text(plan) e WHERE p.id::text=e.key;
    INSERT INTO public.participant_chest_number_changes
      (tenant_id,festival_id,participant_id,old_chest_number,new_chest_number,old_organisation_id,new_organisation_id,changed_by)
    SELECT f.tenant_id,f.id,p.id,old->>'chest_number',p.chest_number,(old->>'organisation_id')::uuid,p.organisation_id,auth.uid()
    FROM jsonb_array_elements(originals) old JOIN public.participants p ON p.id=(old->>'id')::uuid
    WHERE old->>'chest_number' IS DISTINCT FROM p.chest_number;
  END IF;
  SELECT * INTO edited FROM public.participants WHERE id=before.id;
  RETURN to_jsonb(edited);
END $$;
REVOKE ALL ON FUNCTION public.edit_participant_profile(uuid,jsonb,uuid,text,timestamptz,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.edit_participant_profile(uuid,jsonb,uuid,text,timestamptz,uuid,text) TO authenticated;

-- Only invalidation hints are broadcast; names, numbers and teams stay behind
-- each screen's existing authorized read. One hint per festival per statement.
CREATE FUNCTION public.notify_participant_profile_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE changed record;
BEGIN
  FOR changed IN SELECT DISTINCT n.festival_id FROM participant_new n JOIN participant_old o ON n.id=o.id
    WHERE (to_jsonb(n)-'updated_at') IS DISTINCT FROM (to_jsonb(o)-'updated_at')
      AND left(COALESCE(n.chest_number,''),9)<>'__regen__' LOOP
    PERFORM realtime.send('{}'::jsonb,'changed','participant-profiles:'||changed.festival_id::text,false);
    -- Existing stage/PIN screens already subscribe to these label topics.
    PERFORM realtime.send('{}'::jsonb,'changed','code-letters:festival:'||changed.festival_id::text,false);
    PERFORM realtime.send('{}'::jsonb,'changed','code-letters:schedule:'||s.id::text,false)
      FROM public.schedules s WHERE s.festival_id=changed.festival_id;
    PERFORM realtime.send('{}'::jsonb,'changed','code-letters:venue:'||s.venue_id::text,false)
      FROM (SELECT DISTINCT venue_id FROM public.schedules WHERE festival_id=changed.festival_id AND venue_id IS NOT NULL) s;
  END LOOP;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.notify_participant_profile_change() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER notify_participant_profile_change AFTER UPDATE ON public.participants
REFERENCING OLD TABLE AS participant_old NEW TABLE AS participant_new
FOR EACH STATEMENT EXECUTE FUNCTION public.notify_participant_profile_change();
NOTIFY pgrst,'reload schema';
COMMIT;
