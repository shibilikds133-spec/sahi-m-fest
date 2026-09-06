-- Migration 163: Add public workflow status to vw_public_schedule
-- This allows the public landing page to show "Results Under Verification" without exposing secure data.

CREATE OR REPLACE VIEW public.vw_public_schedule AS
SELECT
  sch.id AS schedule_id,
  sch.festival_id,
  sch.item_id,
  sch.venue_id,
  sch.start_time,
  sch.end_time,
  sch.status,
  v.name AS venue_name,
  v.location AS venue_location,
  itm.item_name_en AS item_name,
  itm.item_name_ml AS item_name_ml,
  itm.item_code AS item_code,
  itm.item_type AS item_type,
  itm.category_codes AS item_category_codes,
  (
    SELECT bool_or(res.published = true OR res.result_status = 'published')
    FROM results res
    WHERE res.item_id = sch.item_id
  ) AS is_published,
  (
    SELECT EXISTS (
      SELECT 1 FROM results res WHERE res.item_id = sch.item_id
    )
  ) AS has_results
FROM schedules sch
LEFT JOIN venues v ON v.id = sch.venue_id
LEFT JOIN items itm ON itm.id = sch.item_id;

GRANT SELECT ON public.vw_public_schedule TO anon, authenticated;
