-- Apply only the item changes requested by this admin. Unlike the legacy
-- full-selection RPC, another admin's unrelated changes are left intact.
CREATE OR REPLACE FUNCTION public.apply_competition_item_changes(
  p_festival_id uuid,
  p_activate_codes text[],
  p_deactivate_codes text[],
  p_records jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, scoring_private
AS $$
DECLARE
  owner uuid;
  code text;
  rec jsonb;
BEGIN
  SELECT tenant_id INTO owner
  FROM public.festival_calendar
  WHERE id = p_festival_id;
  IF owner IS NULL THEN
    RAISE EXCEPTION 'Festival not found.';
  END IF;
  PERFORM scoring_private.assert_admin(owner);

  IF p_activate_codes IS NULL OR p_deactivate_codes IS NULL
     OR COALESCE(jsonb_typeof(p_records), '') <> 'array'
     OR (SELECT count(DISTINCT c) FROM unnest(p_activate_codes) AS c) <> cardinality(p_activate_codes)
     OR (SELECT count(DISTINCT c) FROM unnest(p_deactivate_codes) AS c) <> cardinality(p_deactivate_codes)
     OR EXISTS (SELECT 1 FROM unnest(p_activate_codes || p_deactivate_codes) AS c WHERE c IS NULL OR btrim(c) = '')
     OR p_activate_codes && p_deactivate_codes
  THEN
    RAISE EXCEPTION 'Invalid competition item changes.';
  END IF;

  -- The legacy save RPC uses this same festival lock. Once acquired, every
  -- update below runs atomically against the latest committed item state.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_festival_id::text, 0));

  UPDATE public.items
  SET is_active = false
  WHERE festival_id = p_festival_id AND tenant_id = owner
    AND item_code = ANY(p_deactivate_codes) AND is_active;

  UPDATE public.items
  SET is_active = true
  WHERE festival_id = p_festival_id AND tenant_id = owner
    AND item_code = ANY(p_activate_codes) AND NOT is_active;

  FOREACH code IN ARRAY p_activate_codes LOOP
    IF EXISTS (
      SELECT 1 FROM public.items
      WHERE festival_id = p_festival_id AND tenant_id = owner AND item_code = code
    ) THEN
      CONTINUE;
    END IF;

    SELECT value INTO rec
    FROM jsonb_array_elements(p_records)
    WHERE value->>'item_code' = code
    LIMIT 1;
    IF rec IS NULL OR nullif(btrim(rec->>'item_name_ml'), '') IS NULL
       OR COALESCE(jsonb_typeof(rec->'category_codes'), '') <> 'array'
    THEN
      RAISE EXCEPTION 'A complete single-category competition is required.';
    END IF;
    IF jsonb_array_length(rec->'category_codes') <> 1 THEN
      RAISE EXCEPTION 'A complete single-category competition is required.';
    END IF;

    INSERT INTO public.items (
      tenant_id, festival_id, item_code, item_name_ml, item_name_en,
      category_codes, participation_type, source, is_active,
      duration_minutes, group_min_members, group_max_members
    ) VALUES (
      owner, p_festival_id, code, rec->>'item_name_ml',
      COALESCE(rec->>'item_name_en', rec->>'item_name_ml'),
      ARRAY(SELECT jsonb_array_elements_text(rec->'category_codes')),
      rec->>'participation_type', COALESCE(rec->>'source', 'custom'), true,
      (rec->>'duration_minutes')::integer,
      (rec->>'group_min_members')::integer,
      (rec->>'group_max_members')::integer
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_competition_item_changes(uuid, text[], text[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_competition_item_changes(uuid, text[], text[], jsonb) TO authenticated;
