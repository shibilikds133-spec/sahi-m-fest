-- One-time cleanup requested for the current parent organisation.
-- The parent remains intact. Only its five already-archived child rows are
-- removed; historical participant/registration links are detached first.

BEGIN;

CREATE TEMP TABLE _target_suborganisations (id uuid PRIMARY KEY) ON COMMIT DROP;

INSERT INTO _target_suborganisations (id)
SELECT id
FROM public.organisations
WHERE parent_id = '09706507-6ee0-405f-a794-aca8bd8e159a'::uuid
  AND archived_at IS NOT NULL;

UPDATE public.participants p
SET organisation_id = NULL
WHERE p.organisation_id IN (SELECT id FROM _target_suborganisations);

UPDATE public.registrations r
SET organisation_id = NULL
WHERE r.organisation_id IN (SELECT id FROM _target_suborganisations);

UPDATE public.tenants t
SET organisation_id = NULL
WHERE t.organisation_id IN (SELECT id FROM _target_suborganisations);

DELETE FROM public.organisations o
WHERE o.id IN (SELECT id FROM _target_suborganisations);

COMMIT;
NOTIFY pgrst, 'reload schema';
