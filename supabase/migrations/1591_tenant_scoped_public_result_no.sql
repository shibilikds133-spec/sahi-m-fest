-- 159_tenant_scoped_public_result_no.sql
-- Modify public_result_no assignment to be scoped per tenant

CREATE OR REPLACE FUNCTION public.assign_public_result_no()
RETURNS TRIGGER AS $$
DECLARE
  v_next_no INTEGER;
BEGIN
  -- If transitioning to public_visible = true AND it doesn't have a number yet
  IF NEW.public_visible = true AND (OLD.public_visible = false OR OLD.public_visible IS NULL) AND NEW.public_result_no IS NULL THEN
    SELECT COALESCE(MAX(public_result_no), 0) + 1 INTO v_next_no
    FROM public.results
    WHERE tenant_id = NEW.tenant_id;

    NEW.public_result_no := v_next_no;
  END IF;
  
  -- If it was already public_visible but someone set it to true again, and it has no number
  IF NEW.public_visible = true AND NEW.public_result_no IS NULL THEN
    SELECT COALESCE(MAX(public_result_no), 0) + 1 INTO v_next_no
    FROM public.results
    WHERE tenant_id = NEW.tenant_id;

    NEW.public_result_no := v_next_no;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.assign_public_result_no_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_next_no INTEGER;
BEGIN
  IF NEW.public_visible = true AND NEW.public_result_no IS NULL THEN
    SELECT COALESCE(MAX(public_result_no), 0) + 1 INTO v_next_no
    FROM public.results
    WHERE tenant_id = NEW.tenant_id;

    NEW.public_result_no := v_next_no;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Reset and Backfill existing published results per tenant
DO $$
DECLARE
  t RECORD;
  r RECORD;
  counter INTEGER;
BEGIN
  FOR t IN SELECT DISTINCT tenant_id FROM public.results WHERE public_result_no IS NOT NULL LOOP
    counter := 1;
    FOR r IN 
      SELECT id 
      FROM public.results 
      WHERE tenant_id = t.tenant_id AND public_result_no IS NOT NULL 
      ORDER BY published_at ASC NULLS LAST, public_result_no ASC
    LOOP
      UPDATE public.results 
      SET public_result_no = counter 
      WHERE id = r.id;
      
      counter := counter + 1;
    END LOOP;
  END LOOP;
END $$;
