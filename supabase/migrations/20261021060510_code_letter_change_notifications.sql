-- Public broadcasts contain no row data, letters, names, PINs or tokens.
-- They are cache invalidation hints only. Each reader must use its existing
-- authorized admin/PIN/token RPC to fetch the current registration labels.
BEGIN;
CREATE FUNCTION code_letter_private.notify_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s record; changed record;
BEGIN
  -- One hint per event per SQL statement, including a full multi-row draw.
  FOR changed IN SELECT DISTINCT n.festival_id, n.item_id FROM code_letter_new n JOIN code_letter_old o ON o.id = n.id
    WHERE n.code_letter IS DISTINCT FROM o.code_letter OR n.code_letter_fixed IS DISTINCT FROM o.code_letter_fixed LOOP
    PERFORM realtime.send('{}'::jsonb, 'changed', 'code-letters:festival:' || changed.festival_id::text, false);
    FOR s IN SELECT id, venue_id FROM public.schedules
      WHERE festival_id = changed.festival_id AND item_id = changed.item_id LOOP
      PERFORM realtime.send('{}'::jsonb, 'changed', 'code-letters:schedule:' || s.id::text, false);
      IF s.venue_id IS NOT NULL THEN
        PERFORM realtime.send('{}'::jsonb, 'changed', 'code-letters:venue:' || s.venue_id::text, false);
      END IF;
    END LOOP;
  END LOOP;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION code_letter_private.notify_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER registrations_notify_code_letters AFTER UPDATE ON public.registrations
REFERENCING OLD TABLE AS code_letter_old NEW TABLE AS code_letter_new
FOR EACH STATEMENT EXECUTE FUNCTION code_letter_private.notify_change();
COMMIT;
