-- Legacy schedules may not have festival_id even though their item does.
-- Backfill the canonical value and keep the judge RPC resilient while older
-- imports are being normalised.

UPDATE public.schedules schedule
SET festival_id = item.festival_id
FROM public.items item
WHERE item.id = schedule.item_id
  AND schedule.festival_id IS NULL
  AND item.festival_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_judge_registrations(p_schedule_id uuid)
RETURNS TABLE (
  id uuid,
  item_id uuid,
  tenant_id uuid,
  code_letter text,
  participant_name text,
  chest_number text,
  photo_url text,
  category_code text,
  is_verified boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE schedule_context AS (
    SELECT
      schedule.item_id,
      COALESCE(schedule.festival_id, item.festival_id) AS festival_id,
      schedule.tenant_id,
      tenant.organisation_id AS root_organisation_id
    FROM public.schedules schedule
    INNER JOIN public.items item ON item.id = schedule.item_id
    LEFT JOIN public.tenants tenant ON tenant.id = schedule.tenant_id
    WHERE schedule.id = p_schedule_id
  ),
  organisation_tree AS (
    SELECT organisation.id
    FROM public.organisations organisation
    CROSS JOIN schedule_context context
    WHERE
      organisation.id = context.root_organisation_id
      OR (
        context.root_organisation_id IS NULL
        AND organisation.tenant_id = context.tenant_id
      )

    UNION

    SELECT child.id
    FROM public.organisations child
    INNER JOIN organisation_tree parent ON child.parent_id = parent.id
  )
  SELECT
    registration.id,
    registration.item_id,
    registration.tenant_id,
    registration.code_letter,
    participant.name AS participant_name,
    participant.chest_number,
    participant.photo_url,
    participant.category_code,
    registration.is_verified
  FROM public.registrations registration
  INNER JOIN schedule_context context
    ON registration.item_id = context.item_id
   AND registration.festival_id = context.festival_id
  LEFT JOIN public.participants participant
    ON participant.id = registration.participant_id
  WHERE registration.status IS DISTINCT FROM 'rejected'
    AND registration.code_letter IS NOT NULL
    AND COALESCE(
      registration.organisation_id,
      participant.organisation_id
    ) IN (SELECT id FROM organisation_tree)
  ORDER BY registration.code_letter;
$$;

REVOKE ALL ON FUNCTION public.get_judge_registrations(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_judge_registrations(uuid)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
