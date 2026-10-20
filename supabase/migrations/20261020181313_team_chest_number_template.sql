-- Festival-scoped team chest ranges. Existing festivals keep category numbering.
BEGIN;

ALTER TABLE public.festival_calendar
  ADD COLUMN IF NOT EXISTS chest_number_template text NOT NULL DEFAULT 'category';
ALTER TABLE public.festival_calendar
  ADD CONSTRAINT festival_chest_number_template_check
  CHECK (chest_number_template IN ('category', 'team'));

CREATE TABLE public.festival_team_chest_slots (
  festival_id uuid NOT NULL REFERENCES public.festival_calendar(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  slot_number integer NOT NULL CHECK (slot_number > 0),
  PRIMARY KEY (festival_id, organisation_id),
  UNIQUE (festival_id, slot_number)
);
CREATE INDEX festival_team_chest_slots_organisation_idx
  ON public.festival_team_chest_slots (organisation_id);
ALTER TABLE public.festival_team_chest_slots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.festival_team_chest_slots FROM PUBLIC, anon, authenticated;

CREATE TABLE public.participant_chest_number_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  festival_id uuid NOT NULL REFERENCES public.festival_calendar(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  old_chest_number text,
  new_chest_number text,
  old_organisation_id uuid,
  new_organisation_id uuid,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX participant_chest_number_changes_participant_idx
  ON public.participant_chest_number_changes (participant_id, changed_at DESC);
ALTER TABLE public.participant_chest_number_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.participant_chest_number_changes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.participant_chest_number_changes TO authenticated;
CREATE POLICY participant_chest_number_changes_read
  ON public.participant_chest_number_changes FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id() OR public.is_superadmin());

-- Slots are allocated once and never recomputed from changing names/sort order.
CREATE FUNCTION public.ensure_festival_team_chest_slots(p_festival_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_root_id uuid; v_last_slot integer;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_festival_id::text), pg_catalog.hashtext('participant-chest-number'));
  SELECT t.organisation_id INTO v_root_id
  FROM public.festival_calendar f JOIN public.tenants t ON t.id = f.tenant_id
  WHERE f.id = p_festival_id;
  IF v_root_id IS NULL THEN RAISE EXCEPTION 'Festival owner organisation is missing.'; END IF;
  SELECT COALESCE(max(slot_number), 0) INTO v_last_slot
  FROM public.festival_team_chest_slots WHERE festival_id = p_festival_id;
  INSERT INTO public.festival_team_chest_slots(festival_id, organisation_id, slot_number)
  SELECT p_festival_id, o.id, v_last_slot + row_number() OVER (ORDER BY o.created_at, o.id)
  FROM public.organisations o
  WHERE o.parent_id = v_root_id
    AND NOT EXISTS (SELECT 1 FROM public.festival_team_chest_slots s WHERE s.festival_id = p_festival_id AND s.organisation_id = o.id);
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_festival_team_chest_slots(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.festival_team_chest_slot(p_festival_id uuid, p_organisation_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_slot integer;
BEGIN
  SELECT slot_number INTO v_slot FROM public.festival_team_chest_slots
  WHERE festival_id = p_festival_id AND organisation_id = p_organisation_id;
  IF v_slot IS NULL THEN
    PERFORM public.ensure_festival_team_chest_slots(p_festival_id);
    SELECT slot_number INTO v_slot FROM public.festival_team_chest_slots
    WHERE festival_id = p_festival_id AND organisation_id = p_organisation_id;
  END IF;
  IF v_slot IS NULL THEN RAISE EXCEPTION 'Select a team directly under this festival organisation.'; END IF;
  RETURN v_slot;
END;
$$;
REVOKE ALL ON FUNCTION public.festival_team_chest_slot(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Reject direct/CSV inserts that omit a team number or carry an old number
-- from a different range. The normal Add RPC supplies a valid reserved number.
CREATE FUNCTION public.validate_team_chest_number_on_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_range integer; v_slot integer; v_template text;
BEGIN
  -- Serialize direct inserts with a template switch before reading the mode.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(NEW.festival_id::text), pg_catalog.hashtext('participant-chest-number'));
  SELECT chest_number_template, chest_number_category_range
  INTO v_template, v_range FROM public.festival_calendar WHERE id = NEW.festival_id;
  IF v_template IS DISTINCT FROM 'team' THEN RETURN NEW; END IF;
  IF NEW.organisation_id IS NULL OR NEW.tenant_id IS DISTINCT FROM
     (SELECT tenant_id FROM public.organisations WHERE id = NEW.organisation_id) THEN
    RAISE EXCEPTION 'Select a valid team before creating a participant.';
  END IF;
  v_slot := public.festival_team_chest_slot(NEW.festival_id, NEW.organisation_id);
  IF NEW.chest_number IS NULL OR NEW.chest_number !~ '^[0-9]+$' OR
     NEW.chest_number::numeric < v_slot * v_range OR
     NEW.chest_number::numeric >= (v_slot + 1) * v_range THEN
    RAISE EXCEPTION 'The participant chest number must be allocated from the selected team range.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_team_chest_number_on_insert() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER validate_team_chest_number_on_insert
  BEFORE INSERT ON public.participants
  FOR EACH ROW EXECUTE FUNCTION public.validate_team_chest_number_on_insert();

-- A settings update and the renumbering it requires are one transaction.
-- Any invalid team assignment or capacity error rolls back the settings too.
CREATE FUNCTION public.sync_festival_chest_numbers_on_settings_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.chest_number_template = 'team' THEN
      PERFORM public.ensure_festival_team_chest_slots(NEW.id);
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.chest_number_template IS DISTINCT FROM NEW.chest_number_template OR
     OLD.chest_number_category_range IS DISTINCT FROM NEW.chest_number_category_range THEN
    -- The regeneration function takes the same festival-scoped advisory lock
    -- as participant creation, then reads the just-updated calendar row.
    PERFORM public.regenerate_festival_chest_numbers_internal(NEW.id, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_festival_chest_numbers_on_settings_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER sync_festival_chest_numbers_on_settings_change
  AFTER INSERT OR UPDATE OF chest_number_template, chest_number_category_range ON public.festival_calendar
  FOR EACH ROW EXECUTE FUNCTION public.sync_festival_chest_numbers_on_settings_change();

-- Team transfers, including bulk assignment and rollback, receive a fresh number.
CREATE FUNCTION public.renumber_participant_on_team_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_template text; v_range integer; v_slot integer; v_ordinal integer; v_candidate text;
BEGIN
  IF OLD.festival_id IS DISTINCT FROM NEW.festival_id THEN
    RAISE EXCEPTION 'Team transfer cannot change the participant festival.';
  END IF;
  SELECT f.chest_number_template, f.chest_number_category_range
  INTO v_template, v_range FROM public.festival_calendar f WHERE f.id = NEW.festival_id;
  IF v_template IS DISTINCT FROM 'team' THEN RETURN NEW; END IF;
  IF NEW.organisation_id IS NULL THEN RAISE EXCEPTION 'Team-based chest numbers require a team.'; END IF;
  IF NEW.tenant_id IS DISTINCT FROM (SELECT tenant_id FROM public.organisations WHERE id = NEW.organisation_id) THEN
    RAISE EXCEPTION 'Participant tenant must match the destination team.';
  END IF;
  v_slot := public.festival_team_chest_slot(NEW.festival_id, NEW.organisation_id);
  FOR v_ordinal IN 1..v_range LOOP
    v_candidate := ((v_slot * v_range) + v_ordinal - 1)::text;
    IF v_candidate IS DISTINCT FROM OLD.chest_number
       AND NOT EXISTS (SELECT 1 FROM public.participants p
                   WHERE p.festival_id = NEW.festival_id AND p.chest_number = v_candidate AND p.id <> NEW.id) THEN
      NEW.chest_number := v_candidate;
      RETURN NEW;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'Team chest-number capacity (%) reached.', v_range;
END;
$$;
REVOKE ALL ON FUNCTION public.renumber_participant_on_team_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER renumber_participant_on_team_change
  BEFORE UPDATE OF organisation_id ON public.participants
  FOR EACH ROW WHEN (OLD.organisation_id IS DISTINCT FROM NEW.organisation_id)
  EXECUTE FUNCTION public.renumber_participant_on_team_change();

CREATE FUNCTION public.audit_participant_chest_number_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_festival_tenant uuid;
BEGIN
  IF OLD.chest_number IS DISTINCT FROM NEW.chest_number
     AND pg_catalog.left(COALESCE(OLD.chest_number, ''), 9) <> '__regen__'
     AND pg_catalog.left(COALESCE(NEW.chest_number, ''), 9) <> '__regen__' THEN
    SELECT tenant_id INTO v_festival_tenant FROM public.festival_calendar WHERE id = NEW.festival_id;
    INSERT INTO public.participant_chest_number_changes
      (tenant_id, festival_id, participant_id, old_chest_number, new_chest_number,
       old_organisation_id, new_organisation_id, changed_by)
    VALUES (v_festival_tenant, NEW.festival_id, NEW.id, OLD.chest_number, NEW.chest_number,
            OLD.organisation_id, NEW.organisation_id, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_participant_chest_number_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER audit_participant_chest_number_change
  AFTER UPDATE OF chest_number, organisation_id ON public.participants
  FOR EACH ROW EXECUTE FUNCTION public.audit_participant_chest_number_change();

-- Preserve the existing RPC signature and category algorithm; branch only for team mode.
CREATE OR REPLACE FUNCTION public.create_participant_with_chest_number(
  p_tenant_id uuid, p_festival_id uuid, p_organisation_id uuid, p_name text,
  p_category_code text, p_status text, p_age integer, p_class_std text,
  p_dob date, p_gender text, p_public_profile_enabled boolean,
  p_show_organisation_public boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_festival_tenant uuid;
  v_organisation_tenant uuid;
  v_template text;
  v_range integer;
  v_position integer;
  v_ordinal integer;
  v_candidate text;
  v_constraint_name text;
  v_participant public.participants%ROWTYPE;
BEGIN
  IF p_festival_id IS NULL OR p_category_code IS NULL OR pg_catalog.btrim(p_category_code) = '' THEN
    RAISE EXCEPTION 'Festival and category are required to create a participant.';
  END IF;
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
  -- Lock before reading the template so a concurrent settings save cannot
  -- leave this request using the previous numbering mode.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_festival_id::text), pg_catalog.hashtext('participant-chest-number'));
  SELECT tenant_id, chest_number_category_range, chest_number_template
    INTO v_festival_tenant, v_range, v_template
  FROM public.festival_calendar WHERE id = p_festival_id;
  IF NOT FOUND OR v_actor.id IS NULL THEN RAISE EXCEPTION 'Festival not found or authentication is required.'; END IF;
  IF v_actor.is_superadmin IS NOT TRUE AND
     (v_actor.role IS DISTINCT FROM 'admin' OR v_actor.tenant_id IS DISTINCT FROM v_festival_tenant) THEN
    RAISE EXCEPTION 'Only the owning tenant admin can create participants.';
  END IF;
  SELECT tenant_id INTO v_organisation_tenant FROM public.organisations WHERE id = p_organisation_id;
  IF NOT FOUND OR v_organisation_tenant IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'Participant organisation does not match its tenant.';
  END IF;
  IF v_actor.is_superadmin IS NOT TRUE AND NOT public.is_org_visible(p_organisation_id) THEN
    RAISE EXCEPTION 'You cannot create participants in this organisation.';
  END IF;

  IF v_template = 'team' THEN
    v_position := public.festival_team_chest_slot(p_festival_id, p_organisation_id);
  ELSE
    WITH category_codes AS (
      SELECT pg_catalog.lower(pg_catalog.btrim(fc.code)) AS category_code
      FROM public.festival_categories fc
      WHERE fc.festival_id = p_festival_id AND pg_catalog.btrim(COALESCE(fc.code, '')) <> ''
      UNION
      SELECT DISTINCT pg_catalog.lower(pg_catalog.btrim(p.category_code))
      FROM public.participants p
      WHERE p.festival_id = p_festival_id AND pg_catalog.btrim(COALESCE(p.category_code, '')) <> ''
      UNION SELECT pg_catalog.lower(pg_catalog.btrim(p_category_code))
    ), ordered_categories AS (
      SELECT codes.category_code,
        row_number() OVER (ORDER BY fc.sort_order NULLS LAST, codes.category_code) AS position
      FROM category_codes codes
      LEFT JOIN LATERAL (
        SELECT min(fc.sort_order) AS sort_order FROM public.festival_categories fc
        WHERE fc.festival_id = p_festival_id AND pg_catalog.lower(pg_catalog.btrim(fc.code)) = codes.category_code
      ) fc ON true
    )
    SELECT position INTO v_position FROM ordered_categories
    WHERE category_code = pg_catalog.lower(pg_catalog.btrim(p_category_code));
    IF v_position IS NULL THEN RAISE EXCEPTION 'Unable to resolve the participant category position.'; END IF;
  END IF;

  FOR v_ordinal IN 1..v_range LOOP
    v_candidate := ((v_position * v_range) + v_ordinal - 1)::text;
    BEGIN
      INSERT INTO public.participants (
        tenant_id, festival_id, organisation_id, name, category_code, chest_number,
        status, age, class_std, dob, gender, public_profile_enabled, show_organisation_public
      ) VALUES (
        p_tenant_id, p_festival_id, p_organisation_id, p_name, p_category_code, v_candidate,
        p_status, p_age, NULLIF(pg_catalog.btrim(p_class_std), '')::integer, p_dob, p_gender,
        p_public_profile_enabled, p_show_organisation_public
      ) RETURNING * INTO v_participant;
      RETURN to_jsonb(v_participant);
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
      IF v_constraint_name IS DISTINCT FROM 'unique_active_chest_number' THEN RAISE; END IF;
    END;
  END LOOP;
  IF v_template = 'team' THEN
    RAISE EXCEPTION 'Team chest-number capacity (%) reached.', v_range;
  END IF;
  RAISE EXCEPTION 'Category capacity (%) reached. Change the festival range to Under 1000.', v_range;
END;
$$;
REVOKE ALL ON FUNCTION public.create_participant_with_chest_number(
  uuid, uuid, uuid, text, text, text, integer, text, date, text, boolean, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_participant_with_chest_number(
  uuid, uuid, uuid, text, text, text, integer, text, date, text, boolean, boolean
) TO authenticated;

-- The old preview RPC has no organisation parameter. Do not return a wrong
-- category number when a festival has switched to team numbering.
ALTER FUNCTION public.get_next_festival_chest_number(uuid, text)
  RENAME TO get_next_festival_category_chest_number;
REVOKE ALL ON FUNCTION public.get_next_festival_category_chest_number(uuid, text)
  FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.get_next_festival_chest_number(p_festival_id uuid, p_category_code text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_template text; v_festival_tenant uuid; v_actor public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
  SELECT chest_number_template, tenant_id INTO v_template, v_festival_tenant
  FROM public.festival_calendar WHERE id = p_festival_id;
  IF v_actor.id IS NULL OR v_festival_tenant IS NULL THEN
    RAISE EXCEPTION 'Festival not found or authentication is required.';
  END IF;
  IF v_actor.is_superadmin IS NOT TRUE AND
     (v_actor.role IS DISTINCT FROM 'admin' OR v_actor.tenant_id IS DISTINCT FROM v_festival_tenant) THEN
    RAISE EXCEPTION 'Only the owning tenant admin can generate chest numbers.';
  END IF;
  IF v_template = 'team' THEN
    RAISE EXCEPTION 'Team chest numbers require a team; use participant creation to reserve one.';
  END IF;
  RETURN public.get_next_festival_category_chest_number(p_festival_id, p_category_code);
END;
$$;
REVOKE ALL ON FUNCTION public.get_next_festival_chest_number(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_next_festival_chest_number(uuid, text) TO authenticated;

ALTER TABLE public.chest_number_regeneration_audits
  ADD COLUMN IF NOT EXISTS chest_number_template text NOT NULL DEFAULT 'category';

CREATE OR REPLACE FUNCTION public.regenerate_festival_chest_numbers_internal(
  p_festival_id uuid, p_actor_id uuid DEFAULT NULL
)
RETURNS TABLE (participant_count integer, category_range integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_tenant_id uuid;
  v_range integer;
  v_template text;
  v_invalid_count integer;
  v_oversized_key text;
  v_count integer;
  v_expected_count integer;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_festival_id::text), pg_catalog.hashtext('participant-chest-number'));
  SELECT tenant_id, chest_number_category_range, chest_number_template
    INTO v_tenant_id, v_range, v_template
  FROM public.festival_calendar WHERE id = p_festival_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Festival not found.'; END IF;

  IF v_template = 'team' THEN
    PERFORM public.ensure_festival_team_chest_slots(p_festival_id);
    SELECT count(*) INTO v_invalid_count FROM public.participants p
    WHERE p.festival_id = p_festival_id AND NOT EXISTS (
      SELECT 1 FROM public.festival_team_chest_slots s
      WHERE s.festival_id = p_festival_id AND s.organisation_id = p.organisation_id
    );
    IF v_invalid_count > 0 THEN
      RAISE EXCEPTION 'Cannot regenerate: % participant(s) are not assigned to a team under this festival organisation.', v_invalid_count;
    END IF;
    SELECT s.organisation_id::text INTO v_oversized_key
    FROM public.participants p JOIN public.festival_team_chest_slots s
      ON s.festival_id = p_festival_id AND s.organisation_id = p.organisation_id
    WHERE p.festival_id = p_festival_id
    GROUP BY s.organisation_id HAVING count(*) > v_range LIMIT 1;
    IF v_oversized_key IS NOT NULL THEN
      RAISE EXCEPTION 'Team % exceeds the configured chest-number capacity (%).', v_oversized_key, v_range;
    END IF;
  ELSE
    SELECT count(*) INTO v_invalid_count FROM public.participants p
    WHERE p.festival_id = p_festival_id AND
      (p.category_code IS NULL OR pg_catalog.btrim(p.category_code) = '');
    IF v_invalid_count > 0 THEN
      RAISE EXCEPTION 'Cannot regenerate: % participant(s) do not have a category.', v_invalid_count;
    END IF;
    SELECT pg_catalog.lower(pg_catalog.btrim(p.category_code)) INTO v_oversized_key
    FROM public.participants p WHERE p.festival_id = p_festival_id
    GROUP BY pg_catalog.lower(pg_catalog.btrim(p.category_code))
    HAVING count(*) > v_range LIMIT 1;
    IF v_oversized_key IS NOT NULL THEN
      RAISE EXCEPTION 'Category % exceeds the configured chest-number capacity (%).', v_oversized_key, v_range;
    END IF;
  END IF;

  DROP TABLE IF EXISTS pg_temp.chest_number_plan;
  CREATE TEMP TABLE chest_number_plan (
    participant_id uuid PRIMARY KEY, new_chest_number text NOT NULL UNIQUE
  ) ON COMMIT DROP;

  IF v_template = 'team' THEN
    INSERT INTO pg_temp.chest_number_plan(participant_id, new_chest_number)
    SELECT p.id,
      ((s.slot_number * v_range) + row_number() OVER (
        PARTITION BY p.organisation_id ORDER BY
          NULLIF(pg_catalog.regexp_replace(COALESCE(p.chest_number, ''), '[^0-9]', '', 'g'), '')::numeric NULLS LAST,
          pg_catalog.lower(p.name), p.id
      ) - 1)::text
    FROM public.participants p
    JOIN public.festival_team_chest_slots s
      ON s.festival_id = p_festival_id AND s.organisation_id = p.organisation_id
    WHERE p.festival_id = p_festival_id;
  ELSE
    INSERT INTO pg_temp.chest_number_plan(participant_id, new_chest_number)
    WITH category_codes AS (
      SELECT pg_catalog.lower(pg_catalog.btrim(fc.code)) AS category_code
      FROM public.festival_categories fc
      WHERE fc.festival_id = p_festival_id AND pg_catalog.btrim(COALESCE(fc.code, '')) <> ''
      UNION
      SELECT pg_catalog.lower(pg_catalog.btrim(p.category_code))
      FROM public.participants p WHERE p.festival_id = p_festival_id
    ), category_order AS (
      SELECT codes.category_code,
        row_number() OVER (ORDER BY fc.sort_order NULLS LAST, codes.category_code) AS category_position
      FROM category_codes codes
      LEFT JOIN LATERAL (
        SELECT min(fc.sort_order) AS sort_order FROM public.festival_categories fc
        WHERE fc.festival_id = p_festival_id AND pg_catalog.lower(pg_catalog.btrim(fc.code)) = codes.category_code
      ) fc ON true
    )
    SELECT p.id,
      ((co.category_position * v_range) + row_number() OVER (
        PARTITION BY pg_catalog.lower(pg_catalog.btrim(p.category_code)) ORDER BY
          NULLIF(pg_catalog.regexp_replace(COALESCE(p.chest_number, ''), '[^0-9]', '', 'g'), '')::numeric NULLS LAST,
          pg_catalog.lower(p.name), p.id
      ) - 1)::text
    FROM public.participants p
    JOIN category_order co ON co.category_code = pg_catalog.lower(pg_catalog.btrim(p.category_code))
    WHERE p.festival_id = p_festival_id;
  END IF;

  SELECT count(*) INTO v_expected_count FROM public.participants p
  WHERE p.festival_id = p_festival_id;
  SELECT count(*) INTO v_count FROM pg_temp.chest_number_plan;
  IF v_count IS DISTINCT FROM v_expected_count THEN
    RAISE EXCEPTION 'Cannot regenerate: the numbering plan does not cover every participant (% of %).', v_count, v_expected_count;
  END IF;

  -- Move every old value out of the festival's unique index namespace first.
  UPDATE public.participants p SET chest_number = '__regen__' || p.id::text
  WHERE p.festival_id = p_festival_id;
  UPDATE public.participants p SET chest_number = plan.new_chest_number
  FROM pg_temp.chest_number_plan plan WHERE p.id = plan.participant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count IS DISTINCT FROM v_expected_count THEN
    RAISE EXCEPTION 'Cannot regenerate: only % of % participants were updated.', v_count, v_expected_count;
  END IF;
  INSERT INTO public.chest_number_regeneration_audits
    (tenant_id, festival_id, category_range, participant_count, regenerated_by, chest_number_template)
  VALUES (v_tenant_id, p_festival_id, v_range, v_count, p_actor_id, v_template);
  RETURN QUERY SELECT v_count, v_range;
END;
$$;
REVOKE ALL ON FUNCTION public.regenerate_festival_chest_numbers_internal(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Repair the existing single transfer audit insert while preserving its API.
-- The before-update trigger changes the current chest number only in team mode.
CREATE OR REPLACE FUNCTION public.transfer_participant_team(
  p_participant_id uuid, p_new_org_id uuid, p_admin_id uuid
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_participant public.participants%ROWTYPE;
  v_festival_tenant uuid;
  v_initial_festival_id uuid;
  v_root_org uuid;
  v_target_tenant uuid;
  v_batch_id uuid;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
  SELECT * INTO v_participant FROM public.participants WHERE id = p_participant_id;
  IF v_participant.id IS NULL OR v_actor.id IS NULL THEN
    RAISE EXCEPTION 'Participant not found or authentication is required.';
  END IF;
  v_initial_festival_id := v_participant.festival_id;
  SELECT f.tenant_id, t.organisation_id INTO v_festival_tenant, v_root_org
  FROM public.festival_calendar f JOIN public.tenants t ON t.id = f.tenant_id
  WHERE f.id = v_participant.festival_id;
  IF v_actor.is_superadmin IS NOT TRUE AND
     (v_actor.role IS DISTINCT FROM 'admin' OR v_actor.tenant_id IS DISTINCT FROM v_festival_tenant) THEN
    RAISE EXCEPTION 'Only the owning festival admin may transfer participants.';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_participant.festival_id::text), pg_catalog.hashtext('participant-chest-number'));
  SELECT * INTO v_participant FROM public.participants WHERE id = p_participant_id FOR UPDATE;
  IF v_participant.id IS NULL OR v_participant.festival_id IS DISTINCT FROM v_initial_festival_id THEN
    RAISE EXCEPTION 'Participant changed during transfer.';
  END IF;
  SELECT o.tenant_id INTO v_target_tenant FROM public.organisations o
  WHERE o.id = p_new_org_id AND o.parent_id = v_root_org;
  IF v_target_tenant IS NULL THEN RAISE EXCEPTION 'Select a team under this festival organisation.'; END IF;
  IF v_participant.organisation_id = p_new_org_id THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.participants p
             WHERE p.id <> p_participant_id AND p.organisation_id = p_new_org_id
               AND pg_catalog.lower(pg_catalog.btrim(p.name)) = pg_catalog.lower(pg_catalog.btrim(v_participant.name))) THEN
    RAISE EXCEPTION 'A participant with this exact name already exists in the selected team.';
  END IF;
  INSERT INTO public.participant_unit_batches
    (status, total_records, success_count, processed_count, created_by, tenant_id, target_unit_id, completed_at)
  VALUES ('completed', 1, 1, 1, v_actor.id, v_festival_tenant, p_new_org_id, now())
  RETURNING id INTO v_batch_id;
  UPDATE public.participants SET organisation_id = p_new_org_id,
    tenant_id = v_target_tenant, updated_at = now()
  WHERE id = p_participant_id;
  UPDATE public.registrations SET organisation_id = p_new_org_id, tenant_id = v_target_tenant
  WHERE participant_id = p_participant_id AND (is_group_registration = false OR is_group_registration IS NULL);
  INSERT INTO public.participant_unit_audit_logs
    (participant_id, old_unit_id, new_unit_id, changed_by, batch_id, tenant_id)
  VALUES (p_participant_id, v_participant.organisation_id, p_new_org_id, v_actor.id, v_batch_id, v_festival_tenant);
END;
$$;
REVOKE ALL ON FUNCTION public.transfer_participant_team(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_participant_team(uuid, uuid, uuid) TO authenticated;

-- Legacy JSON imports identify participants by an externally supplied chest
-- number. Keep schedule imports and the category-template import path intact.
CREATE FUNCTION public.assert_legacy_chest_import_allowed(p_tenant_id uuid, p_festival_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public._assert_import_access(p_tenant_id, p_festival_id);
  IF EXISTS (
    SELECT 1 FROM public.festival_calendar f
    WHERE f.id = p_festival_id AND f.chest_number_template = 'team'
  ) THEN
    RAISE EXCEPTION 'Legacy chest-number JSON import is unavailable for the team template. Add participants normally.';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_legacy_chest_import_allowed(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Preserve public RPC signatures. The original functions remain private and
-- retain their complete category-template behavior and authorization checks.
ALTER FUNCTION public.execute_junior_import_chunk(uuid, uuid, uuid, jsonb)
  RENAME TO _legacy_execute_junior_import_chunk;
ALTER FUNCTION public.execute_senior_import_chunk(uuid, uuid, uuid, jsonb)
  RENAME TO _legacy_execute_senior_import_chunk;
ALTER FUNCTION public.execute_upper_primary_import_chunk(uuid, uuid, uuid, jsonb)
  RENAME TO _legacy_execute_upper_primary_import_chunk;
ALTER FUNCTION public.execute_lp_import_chunk(uuid, uuid, text, jsonb)
  RENAME TO _legacy_execute_lp_import_chunk;
ALTER FUNCTION public.execute_hs_import_chunk(uuid, uuid, text, jsonb)
  RENAME TO _legacy_execute_hs_import_chunk;
ALTER FUNCTION public.execute_hss_import_chunk(uuid, uuid, text, jsonb)
  RENAME TO _legacy_execute_hss_import_chunk;
ALTER FUNCTION public.execute_general_import_chunk(uuid, uuid, text, jsonb)
  RENAME TO _legacy_execute_general_import_chunk;

REVOKE ALL ON FUNCTION public._legacy_execute_junior_import_chunk(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._legacy_execute_senior_import_chunk(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._legacy_execute_upper_primary_import_chunk(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._legacy_execute_lp_import_chunk(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._legacy_execute_hs_import_chunk(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._legacy_execute_hss_import_chunk(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._legacy_execute_general_import_chunk(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.execute_junior_import_chunk(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.assert_legacy_chest_import_allowed(p_tenant_id, p_festival_id);
  RETURN public._legacy_execute_junior_import_chunk(p_tenant_id, p_festival_id, p_session_id, p_participants);
END;
$$;
CREATE FUNCTION public.execute_senior_import_chunk(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.assert_legacy_chest_import_allowed(p_tenant_id, p_festival_id);
  RETURN public._legacy_execute_senior_import_chunk(p_tenant_id, p_festival_id, p_session_id, p_participants);
END;
$$;
CREATE FUNCTION public.execute_upper_primary_import_chunk(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.assert_legacy_chest_import_allowed(p_tenant_id, p_festival_id);
  RETURN public._legacy_execute_upper_primary_import_chunk(p_tenant_id, p_festival_id, p_session_id, p_participants);
END;
$$;
CREATE FUNCTION public.execute_lp_import_chunk(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.assert_legacy_chest_import_allowed(p_tenant_id, p_festival_id);
  RETURN public._legacy_execute_lp_import_chunk(p_tenant_id, p_festival_id, p_session_id, p_participants);
END;
$$;
CREATE FUNCTION public.execute_hs_import_chunk(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.assert_legacy_chest_import_allowed(p_tenant_id, p_festival_id);
  RETURN public._legacy_execute_hs_import_chunk(p_tenant_id, p_festival_id, p_session_id, p_participants);
END;
$$;
CREATE FUNCTION public.execute_hss_import_chunk(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.assert_legacy_chest_import_allowed(p_tenant_id, p_festival_id);
  RETURN public._legacy_execute_hss_import_chunk(p_tenant_id, p_festival_id, p_session_id, p_participants);
END;
$$;
CREATE FUNCTION public.execute_general_import_chunk(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.assert_legacy_chest_import_allowed(p_tenant_id, p_festival_id);
  RETURN public._legacy_execute_general_import_chunk(p_tenant_id, p_festival_id, p_session_id, p_participants);
END;
$$;
REVOKE ALL ON FUNCTION public.execute_junior_import_chunk(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.execute_senior_import_chunk(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.execute_upper_primary_import_chunk(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.execute_lp_import_chunk(uuid, uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.execute_hs_import_chunk(uuid, uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.execute_hss_import_chunk(uuid, uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.execute_general_import_chunk(uuid, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_junior_import_chunk(uuid, uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_senior_import_chunk(uuid, uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_upper_primary_import_chunk(uuid, uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_lp_import_chunk(uuid, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_hs_import_chunk(uuid, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_hss_import_chunk(uuid, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_general_import_chunk(uuid, uuid, text, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
