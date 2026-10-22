-- Remove only an unused, inactive festival-owned competition. Never cascade
-- registrations, schedule/history, completion state, or generated media.
CREATE TABLE public.festival_hidden_competition_items (
  festival_id uuid NOT NULL REFERENCES public.festival_calendar(id),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  item_code text NOT NULL,
  deleted_item_id uuid NOT NULL,
  hidden_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (festival_id, item_code)
);

ALTER TABLE public.festival_hidden_competition_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.festival_hidden_competition_items FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.get_hidden_competition_item_codes(p_festival_id uuid)
RETURNS SETOF text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, scoring_private
AS $$
DECLARE v_owner uuid;
BEGIN
  SELECT tenant_id INTO v_owner FROM public.festival_calendar WHERE id = p_festival_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Festival not found.' USING ERRCODE = 'P0002';
  END IF;
  PERFORM scoring_private.assert_admin(v_owner);
  RETURN QUERY SELECT h.item_code FROM public.festival_hidden_competition_items h
    WHERE h.festival_id = p_festival_id AND h.tenant_id = v_owner;
END;
$$;

REVOKE ALL ON FUNCTION public.get_hidden_competition_item_codes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_hidden_competition_item_codes(uuid) TO authenticated;

-- A stale tab or an older item-save RPC must not recreate a hidden festival item.
CREATE FUNCTION public.reject_hidden_competition_item_activation()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.is_active IS TRUE AND EXISTS (
    SELECT 1 FROM public.festival_hidden_competition_items h
    WHERE h.festival_id = NEW.festival_id
      AND h.tenant_id = NEW.tenant_id
      AND h.item_code = NEW.item_code
  ) THEN
    RAISE EXCEPTION 'This competition was deleted from this festival.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER reject_hidden_competition_item_activation
BEFORE INSERT OR UPDATE OF is_active, item_code, festival_id ON public.items
FOR EACH ROW EXECUTE FUNCTION public.reject_hidden_competition_item_activation();

CREATE OR REPLACE FUNCTION public.delete_inactive_competition_item(
  p_festival_id uuid,
  p_item_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, scoring_private
AS $$
DECLARE
  v_owner uuid;
  v_item public.items%ROWTYPE;
BEGIN
  SELECT tenant_id INTO v_owner
  FROM public.festival_calendar
  WHERE id = p_festival_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Festival not found.' USING ERRCODE = 'P0002';
  END IF;
  PERFORM scoring_private.assert_admin(v_owner);

  -- Both the atomic change RPC and the legacy full-save RPC use these locks.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_festival_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('items:' || p_festival_id::text, 0));

  -- Lock the item so concurrent registrations cannot slip in between the
  -- dependency check and deletion. Foreign keys provide the final guard.
  SELECT * INTO v_item
  FROM public.items
  WHERE id = p_item_id AND festival_id = p_festival_id AND tenant_id = v_owner
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Competition not found in this festival.' USING ERRCODE = 'P0002';
  END IF;
  IF v_item.is_active IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Deselect this competition and save the change before deleting it.' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (SELECT 1 FROM public.registrations WHERE item_id = p_item_id)
     OR EXISTS (SELECT 1 FROM public.schedules WHERE item_id = p_item_id)
     OR EXISTS (SELECT 1 FROM public.results WHERE item_id = p_item_id)
     OR EXISTS (SELECT 1 FROM public.certificates WHERE item_id = p_item_id)
     OR EXISTS (SELECT 1 FROM public.mark_entries WHERE item_id = p_item_id)
     OR EXISTS (SELECT 1 FROM public.program_intake_statuses WHERE item_id = p_item_id)
     OR EXISTS (SELECT 1 FROM public.generated_assets WHERE event_id = p_item_id)
     OR EXISTS (SELECT 1 FROM public.points_config c
       WHERE c.festival_id = p_festival_id AND c.tenant_id = v_owner
         AND (p_item_id = ANY(c.grade_boost_item_ids) OR p_item_id = ANY(c.rank_boost_item_ids)))
     OR EXISTS (SELECT 1 FROM public.points_config_versions v
       WHERE v.festival_id = p_festival_id AND v.tenant_id = v_owner
         AND v.config_snapshot::text LIKE '%' || p_item_id::text || '%')
  THEN
    RAISE EXCEPTION 'This competition has existing activity or history. It is deselected but cannot be deleted.' USING ERRCODE = '23503';
  END IF;

  BEGIN
    DELETE FROM public.items WHERE id = p_item_id;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'This competition still has related data. It remains deselected and was not deleted.' USING ERRCODE = '23503';
  END;

  INSERT INTO public.festival_hidden_competition_items
    (festival_id, tenant_id, item_code, deleted_item_id)
  VALUES (p_festival_id, v_owner, v_item.item_code, p_item_id);

  INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (v_owner, auth.uid(), 'DELETE_UNUSED_COMPETITION_ITEM', 'items', p_item_id,
    to_jsonb(v_item), jsonb_build_object('status', 'deleted'));
END;
$$;

REVOKE ALL ON FUNCTION public.delete_inactive_competition_item(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_inactive_competition_item(uuid, uuid) TO authenticated;
