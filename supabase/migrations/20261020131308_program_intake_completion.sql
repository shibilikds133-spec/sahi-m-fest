-- Intake completion is metadata only; it does not alter registrations or marks.
CREATE TABLE public.program_intake_statuses (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  festival_id uuid NOT NULL REFERENCES public.festival_calendar(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  category_code text NOT NULL,
  entry_kind text NOT NULL CHECK (entry_kind IN ('participant', 'general_team')),
  is_complete boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  completed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (festival_id, item_id, category_code, entry_kind),
  CONSTRAINT program_intake_status_category_not_blank CHECK (btrim(category_code) <> '')
);

ALTER TABLE public.program_intake_statuses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.program_intake_statuses FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.program_intake_statuses TO authenticated;

CREATE POLICY program_intake_status_admin_read
  ON public.program_intake_statuses
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles actor
      WHERE actor.id = (SELECT auth.uid())
        AND (actor.is_superadmin IS TRUE OR (actor.role = 'admin' AND actor.tenant_id = program_intake_statuses.tenant_id))
    )
  );

CREATE OR REPLACE FUNCTION public.set_program_intake_status(
  p_festival_id uuid,
  p_item_id uuid,
  p_category_code text,
  p_entry_kind text,
  p_is_complete boolean
)
RETURNS public.program_intake_statuses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_festival public.festival_calendar%ROWTYPE;
  v_item public.items%ROWTYPE;
  v_result public.program_intake_statuses%ROWTYPE;
  v_category text := upper(btrim(p_category_code));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND OR (v_actor.role IS DISTINCT FROM 'admin' AND v_actor.is_superadmin IS NOT TRUE) THEN
    RAISE EXCEPTION 'Administrator access is required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_festival FROM public.festival_calendar WHERE id = p_festival_id;
  IF NOT FOUND OR (v_actor.is_superadmin IS NOT TRUE AND v_actor.tenant_id IS DISTINCT FROM v_festival.tenant_id) THEN
    RAISE EXCEPTION 'Festival is outside your organisation scope.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_item FROM public.items
  WHERE id = p_item_id AND festival_id = p_festival_id AND tenant_id = v_festival.tenant_id;
  IF NOT FOUND OR v_item.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Select an active competition from this festival.';
  END IF;

  IF p_entry_kind IS NULL OR p_entry_kind NOT IN ('participant', 'general_team') OR v_category IS NULL OR v_category = '' THEN
    RAISE EXCEPTION 'A valid competition category and entry type are required.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM unnest(COALESCE(v_item.category_codes, ARRAY[]::text[])) code
    WHERE upper(btrim(code)) = v_category
  ) THEN
    RAISE EXCEPTION 'The category does not belong to this competition.';
  END IF;
  IF p_entry_kind = 'general_team'
     AND (v_category NOT IN ('GN', 'GENERAL') OR v_item.participation_type IS DISTINCT FROM 'group') THEN
    RAISE EXCEPTION 'General entries require an active General group competition.';
  END IF;
  IF p_entry_kind = 'general_team' AND v_festival.general_category_enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'General entries are disabled for this festival.';
  END IF;
  IF p_entry_kind = 'participant' AND v_category IN ('GN', 'GENERAL') THEN
    RAISE EXCEPTION 'General competitions are completed through team entries.';
  END IF;

  INSERT INTO public.program_intake_statuses (
    tenant_id, festival_id, item_id, category_code, entry_kind,
    is_complete, completed_at, completed_by, updated_at
  ) VALUES (
    v_festival.tenant_id, p_festival_id, p_item_id, v_category, p_entry_kind,
    p_is_complete,
    CASE WHEN p_is_complete THEN now() ELSE NULL END,
    CASE WHEN p_is_complete THEN auth.uid() ELSE NULL END,
    now()
  )
  ON CONFLICT (festival_id, item_id, category_code, entry_kind)
  DO UPDATE SET
    is_complete = EXCLUDED.is_complete,
    completed_at = EXCLUDED.completed_at,
    completed_by = EXCLUDED.completed_by,
    updated_at = now()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.set_program_intake_status(uuid, uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_program_intake_status(uuid, uuid, text, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.reopen_program_intake_on_registration_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_festival_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.festival_id ELSE NEW.festival_id END;
  v_item_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.item_id ELSE NEW.item_id END;
  v_entry_kind text := CASE WHEN TG_OP = 'DELETE' THEN OLD.entry_kind ELSE NEW.entry_kind END;
  v_participant_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.participant_id ELSE NEW.participant_id END;
  v_tenant_id uuid;
  v_category text;
  v_participant_category text;
  v_kind text;
BEGIN
  IF v_entry_kind = 'general_team' THEN
    v_category := 'GN';
    v_kind := 'general_team';
  ELSIF v_participant_id IS NOT NULL THEN
    SELECT upper(btrim(category_code)) INTO v_participant_category
    FROM public.participants WHERE id = v_participant_id;
    SELECT upper(btrim(category_code)) INTO v_category
    FROM public.items item
    CROSS JOIN LATERAL unnest(COALESCE(item.category_codes, ARRAY[]::text[])) AS categories(category_code)
    WHERE item.id = v_item_id
      AND (
        upper(btrim(categories.category_code)) = v_participant_category
        OR (upper(btrim(categories.category_code)) = 'JR' AND v_participant_category = 'JUNIOR')
        OR (upper(btrim(categories.category_code)) = 'JUNIOR' AND v_participant_category = 'JR')
        OR (upper(btrim(categories.category_code)) = 'SR' AND v_participant_category = 'SENIOR')
        OR (upper(btrim(categories.category_code)) = 'SENIOR' AND v_participant_category = 'SR')
        OR (upper(btrim(categories.category_code)) = 'CA' AND v_participant_category = 'CAMPUS')
        OR (upper(btrim(categories.category_code)) = 'CAMPUS' AND v_participant_category = 'CA')
      )
    LIMIT 1;
    v_kind := 'participant';
  ELSE
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.festival_calendar WHERE id = v_festival_id;
  IF v_tenant_id IS NOT NULL AND v_category IS NOT NULL
     AND (v_kind = 'general_team' OR v_category NOT IN ('', 'GN', 'GENERAL')) THEN
    INSERT INTO public.program_intake_statuses (
      tenant_id, festival_id, item_id, category_code, entry_kind,
      is_complete, completed_at, completed_by, updated_at
    ) VALUES (v_tenant_id, v_festival_id, v_item_id, v_category, v_kind, false, NULL, NULL, now())
    ON CONFLICT (festival_id, item_id, category_code, entry_kind)
    DO UPDATE SET is_complete = false, completed_at = NULL, completed_by = NULL, updated_at = now();
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_program_intake_on_registration_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER registrations_reopen_program_intake
  AFTER INSERT OR DELETE ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.reopen_program_intake_on_registration_change();

NOTIFY pgrst, 'reload schema';
