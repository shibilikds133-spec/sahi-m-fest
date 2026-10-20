BEGIN;

ALTER TABLE public.festival_calendar
  ADD COLUMN gender_mode text NOT NULL DEFAULT 'both';

ALTER TABLE public.festival_calendar
  ADD CONSTRAINT festival_calendar_gender_mode_check
  CHECK (gender_mode IN ('boys_only', 'girls_only', 'both'));

CREATE OR REPLACE FUNCTION public.enforce_festival_participant_gender()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_gender_mode text;
  v_gender text := lower(btrim(coalesce(NEW.gender, '')));
BEGIN
  IF NEW.festival_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT fc.gender_mode
    INTO v_gender_mode
    FROM public.festival_calendar AS fc
   WHERE fc.id = NEW.festival_id;

  -- Let the existing festival/category validation report a missing festival.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_gender_mode = 'boys_only' THEN
    IF v_gender = '' THEN
      NEW.gender := 'boys';
    ELSIF v_gender <> 'boys' THEN
      RAISE EXCEPTION 'This festival is configured for boys only.'
        USING ERRCODE = '23514';
    END IF;
  ELSIF v_gender_mode = 'girls_only' THEN
    IF v_gender = '' THEN
      NEW.gender := 'girls';
    ELSIF v_gender <> 'girls' THEN
      RAISE EXCEPTION 'This festival is configured for girls only.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.enforce_festival_participant_gender() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enforce_festival_participant_gender()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_enforce_festival_participant_gender
  BEFORE INSERT OR UPDATE OF gender, festival_id ON public.participants
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_festival_participant_gender();

COMMENT ON COLUMN public.festival_calendar.gender_mode IS
  'Festival-wide participant gender policy: boys_only, girls_only, or both.';

COMMIT;

NOTIFY pgrst, 'reload schema';
