-- Migration 156: safe General-category lifecycle.
-- General is opt-in. A tenant admin creates/restores it explicitly from the
-- category settings page. It can be hard-deleted only when unused; referenced
-- history is never deleted.

BEGIN;

ALTER TABLE public.festival_calendar
  ALTER COLUMN general_category_enabled SET DEFAULT false;

CREATE OR REPLACE FUNCTION public.delete_festival_category_safely(p_category_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_category public.festival_categories%ROWTYPE;
  v_participant_count integer;
  v_item_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_category
  FROM public.festival_categories
  WHERE id = p_category_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found', 'category_id', p_category_id);
  END IF;

  IF NOT (
    public.is_superadmin()
    OR v_category.tenant_id = public.get_my_tenant_id()
  ) THEN
    RAISE EXCEPTION 'You do not have permission to delete this category.' USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::integer INTO v_participant_count
  FROM public.participants p
  WHERE p.festival_id = v_category.festival_id
    AND p.tenant_id = v_category.tenant_id
    AND lower(btrim(p.category_code)) = lower(btrim(v_category.code));

  SELECT count(*)::integer INTO v_item_count
  FROM public.items i
  WHERE i.festival_id = v_category.festival_id
    AND i.tenant_id = v_category.tenant_id
    AND EXISTS (
      SELECT 1 FROM unnest(i.category_codes) AS item_category
      WHERE lower(btrim(item_category)) = lower(btrim(v_category.code))
    );

  IF v_participant_count > 0 OR v_item_count > 0 THEN
    RETURN jsonb_build_object(
      'status', 'blocked',
      'category_id', v_category.id,
      'participant_count', v_participant_count,
      'item_count', v_item_count,
      'message', format(
        'Category cannot be deleted because it is used by %s participant(s) and %s item(s). Archive or disable it instead; history is preserved.',
        v_participant_count, v_item_count
      )
    );
  END IF;

  DELETE FROM public.festival_categories WHERE id = v_category.id;

  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
    VALUES (
      v_category.tenant_id,
      auth.uid(),
      'DELETE_FESTIVAL_CATEGORY',
      'festival_categories',
      v_category.id,
      to_jsonb(v_category),
      jsonb_build_object('status', 'removed', 'removed_at', now())
    );
  END IF;

  RETURN jsonb_build_object('status', 'removed', 'category_id', v_category.id);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_festival_category_safely(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_festival_category_safely(uuid) TO authenticated;

COMMENT ON FUNCTION public.delete_festival_category_safely(uuid) IS
  'Deletes an unused festival category only. Participant/item references block deletion and preserve history.';

COMMIT;
NOTIFY pgrst, 'reload schema';
