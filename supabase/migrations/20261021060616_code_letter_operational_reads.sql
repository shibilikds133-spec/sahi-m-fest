-- Preserve existing table-returning RPC signatures for older clients.
BEGIN;
CREATE FUNCTION public.get_stage_management_registrations_with_letters(
  p_schedule_id uuid DEFAULT NULL, p_festival_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(pg_catalog.jsonb_agg(to_jsonb(scoped) || pg_catalog.jsonb_build_object(
    'code_letter_fixed', r.code_letter_fixed)), '[]'::jsonb)
  FROM public.get_stage_management_registrations_scoped(p_schedule_id, p_festival_id) scoped
  JOIN public.registrations r ON r.id = scoped.id;
$$;
DO $optional_portal$ BEGIN
  IF pg_catalog.to_regprocedure('public.stage_venue_portal_data(uuid,text)') IS NOT NULL THEN
    EXECUTE $portal_definition$
CREATE FUNCTION public.stage_venue_portal_data_with_letters(p_venue_id uuid, p_pin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE data jsonb;
BEGIN
  data := public.stage_venue_portal_data(p_venue_id, p_pin);
  IF data ? 'error' THEN RETURN data; END IF;
  RETURN pg_catalog.jsonb_set(data, '{registrations}', COALESCE((
    SELECT pg_catalog.jsonb_agg(entry || pg_catalog.jsonb_build_object('code_letter_fixed', r.code_letter_fixed) ORDER BY position)
    FROM pg_catalog.jsonb_array_elements(data->'registrations') WITH ORDINALITY entries(entry, position)
    JOIN public.registrations r ON r.id = (entry->>'id')::uuid
  ), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.stage_venue_portal_data_with_letters(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stage_venue_portal_data_with_letters(uuid,text) TO anon, authenticated;
$portal_definition$;
  END IF;
END $optional_portal$;
REVOKE ALL ON FUNCTION public.get_stage_management_registrations_with_letters(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_stage_management_registrations_with_letters(uuid,uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
