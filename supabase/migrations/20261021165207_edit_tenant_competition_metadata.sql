BEGIN;

-- Edit metadata only for an item owned by the current festival tenant.
-- Shared handbook rows (tenant_id IS NULL) are intentionally not editable here.
CREATE OR REPLACE FUNCTION public.update_competition_item(
  p_festival_id uuid,
  p_item_id uuid,
  p_item_name_ml text,
  p_category_codes text[],
  p_group_member_count integer,
  p_expected_updated_at timestamptz
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, scoring_private
AS $$
DECLARE
  v_owner uuid;
  v_item public.items%ROWTYPE;
  v_category_codes text[];
BEGIN
  SELECT tenant_id INTO v_owner
  FROM public.festival_calendar
  WHERE id = p_festival_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Festival not found.';
  END IF;
  PERFORM scoring_private.assert_admin(v_owner);

  IF p_item_id IS NULL
     OR nullif(btrim(p_item_name_ml), '') IS NULL
     OR p_category_codes IS NULL
     OR COALESCE(cardinality(p_category_codes), 0) = 0
     OR array_ndims(p_category_codes) <> 1
  THEN
    RAISE EXCEPTION 'Invalid competition item details.';
  END IF;

  SELECT array_agg(btrim(category.code) ORDER BY category.ordinality)
  INTO v_category_codes
  FROM unnest(p_category_codes) WITH ORDINALITY AS category(code, ordinality);
  IF EXISTS (
       SELECT 1 FROM unnest(v_category_codes) AS category(code)
       WHERE category.code IS NULL OR category.code = ''
     )
     OR (SELECT count(*) FROM unnest(v_category_codes)) <>
        (SELECT count(DISTINCT category.code) FROM unnest(v_category_codes) AS category(code))
  THEN
    RAISE EXCEPTION 'Category codes must be non-blank and unique.';
  END IF;

  -- Serialize metadata edits with the existing item-change workflow.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_festival_id::text, 0));

  SELECT * INTO v_item
  FROM public.items
  WHERE id = p_item_id
    AND festival_id = p_festival_id
    AND tenant_id = v_owner
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Competition item not found for this festival.';
  END IF;
  IF v_item.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'This competition changed after it was opened. Reload and try again.'
      USING ERRCODE = '40001';
  END IF;

  IF v_item.participation_type = 'group' THEN
    IF COALESCE(p_group_member_count, 0) < 1 THEN
      RAISE EXCEPTION 'Enter a positive member count for this group competition.';
    END IF;
  ELSIF v_item.participation_type = 'individual' THEN
    IF p_group_member_count IS NOT NULL THEN
      RAISE EXCEPTION 'Member count can only be set for group competitions.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Competition participation type is invalid.';
  END IF;

  UPDATE public.items
  SET item_name_ml = btrim(p_item_name_ml),
      item_name_en = CASE
        WHEN item_name_en IS NULL OR item_name_en = item_name_ml THEN btrim(p_item_name_ml)
        ELSE item_name_en
      END,
      category_codes = v_category_codes,
      group_min_members = CASE WHEN v_item.participation_type = 'group'
        THEN p_group_member_count ELSE group_min_members END,
      group_max_members = CASE WHEN v_item.participation_type = 'group'
        THEN p_group_member_count ELSE group_max_members END,
      updated_at = clock_timestamp()
  WHERE id = v_item.id
    AND festival_id = p_festival_id
    AND tenant_id = v_owner;
END;
$$;

REVOKE ALL ON FUNCTION public.update_competition_item(uuid, uuid, text, text[], integer, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_competition_item(uuid, uuid, text, text[], integer, timestamptz)
  TO authenticated;

COMMENT ON FUNCTION public.update_competition_item(uuid, uuid, text, text[], integer, timestamptz) IS
  'Updates a tenant-owned competition name, category codes, and (for group items) exact member count. Requires admin authorization and an updated_at concurrency token; does not create or modify schedules.';

NOTIFY pgrst, 'reload schema';
COMMIT;

