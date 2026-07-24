-- Public read-only database views for the multilingual Public AI Assistant.
-- These views strictly filter data down to only published results and active schedules.

-- 1. Leaderboard aggregate view
CREATE OR REPLACE VIEW public.vw_public_leaderboard AS
SELECT
  org.id AS organisation_id,
  COALESCE(org.name, 'Unassigned') AS organisation_name,
  org.org_type AS organisation_type,
  org.parent_id,
  COALESCE(SUM(COALESCE(res.points_awarded, 0)), 0)::bigint AS total_points,
  COUNT(*) FILTER (WHERE res.rank = 1)::bigint AS first_place_count,
  COUNT(*) FILTER (WHERE res.rank = 2)::bigint AS second_place_count,
  COUNT(*) FILTER (WHERE res.rank = 3)::bigint AS third_place_count,
  COUNT(*) FILTER (WHERE res.grade = 'A+')::bigint AS grade_a_plus_count,
  COUNT(*) FILTER (WHERE res.grade = 'A')::bigint AS grade_a_count,
  COUNT(*) FILTER (WHERE res.grade = 'B')::bigint AS grade_b_count,
  COUNT(*) FILTER (WHERE res.grade = 'C')::bigint AS grade_c_count,
  COUNT(*)::bigint AS result_count,
  MAX(res.published_at) AS latest_published_at,
  res.festival_id
FROM results res
JOIN festival_calendar festival ON festival.id = res.festival_id
LEFT JOIN registrations reg ON reg.id = res.registration_id
LEFT JOIN participants participant ON participant.id = reg.participant_id
LEFT JOIN organisations org ON org.id = COALESCE(reg.organisation_id, participant.organisation_id)
WHERE res.published IS TRUE
  AND res.public_visible IS TRUE
  AND COALESCE(res.result_status, 'published') = 'published'
GROUP BY org.id, org.name, org.org_type, org.parent_id, res.festival_id;

-- 2. Individual published results view
CREATE OR REPLACE VIEW public.vw_public_results AS
SELECT
  res.id AS result_id,
  res.registration_id,
  res.item_id,
  COALESCE(itm.item_name_en, '') AS item_name,
  COALESCE(itm.item_name_ml, '') AS item_name_ml,
  COALESCE(itm.participation_type = 'group', false) AS is_group,
  COALESCE(itm.category_codes, ARRAY[]::text[]) AS item_category_codes,
  org.id AS organisation_id,
  COALESCE(org.name, 'Unassigned') AS organisation_name,
  org.org_type AS organisation_type,
  participant.id AS participant_id,
  COALESCE(participant.name, '') AS participant_name,
  COALESCE(participant.chest_number, '') AS chest_number,
  participant.category_code AS participant_category_code,
  res.rank,
  res.grade,
  res.points_awarded,
  res.published_at,
  res.festival_id
FROM results res
LEFT JOIN registrations reg ON reg.id = res.registration_id
LEFT JOIN items itm ON itm.id = res.item_id
LEFT JOIN participants participant ON participant.id = reg.participant_id
LEFT JOIN organisations org ON org.id = COALESCE(reg.organisation_id, participant.organisation_id)
WHERE res.published IS TRUE
  AND res.public_visible IS TRUE
  AND COALESCE(res.result_status, 'published') = 'published';

-- 3. Public schedule view
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
  itm.category_codes AS item_category_codes
FROM schedules sch
LEFT JOIN venues v ON v.id = sch.venue_id
LEFT JOIN items itm ON itm.id = sch.item_id;

-- 4. Public live status counts view
CREATE OR REPLACE VIEW public.vw_public_live_status AS
SELECT
  festival.id AS festival_id,
  festival.custom_name AS festival_name,
  COUNT(DISTINCT res.id) FILTER (WHERE res.published IS TRUE AND res.public_visible IS TRUE AND COALESCE(res.result_status, 'published') = 'published')::bigint AS published_results_count,
  COUNT(DISTINCT sch.id) FILTER (WHERE sch.status = 'live')::bigint AS live_stages_count,
  COUNT(DISTINCT sch.venue_id) FILTER (WHERE sch.status = 'live')::bigint AS active_venues_count,
  COUNT(DISTINCT itm.id)::bigint AS total_items_count
FROM festival_calendar festival
LEFT JOIN results res ON res.festival_id = festival.id AND res.published IS TRUE AND res.public_visible IS TRUE
LEFT JOIN schedules sch ON sch.festival_id = festival.id
LEFT JOIN items itm ON itm.id = sch.item_id
GROUP BY festival.id, festival.custom_name;

-- Grant select rights on these read-only views to both anonymous public users and authenticated users
GRANT SELECT ON public.vw_public_leaderboard TO anon, authenticated;
GRANT SELECT ON public.vw_public_results TO anon, authenticated;
GRANT SELECT ON public.vw_public_schedule TO anon, authenticated;
GRANT SELECT ON public.vw_public_live_status TO anon, authenticated;

-- 5. Public participant profiles view (for chatbot context)
CREATE OR REPLACE VIEW public.vw_public_participants AS
SELECT
  p.id AS participant_id,
  p.festival_id,
  p.name AS participant_name,
  p.chest_number,
  p.profile_slug,
  itm.item_code,
  itm.item_name_en AS item_name,
  itm.item_name_ml AS item_name_ml,
  CASE WHEN res.published IS TRUE AND res.public_visible IS TRUE THEN res.rank ELSE NULL END AS rank,
  CASE WHEN res.published IS TRUE AND res.public_visible IS TRUE THEN res.grade ELSE NULL END AS grade,
  CASE WHEN res.published IS TRUE AND res.public_visible IS TRUE THEN res.points_awarded ELSE 0 END AS points_awarded
FROM participants p
LEFT JOIN registrations reg ON reg.participant_id = p.id AND reg.status IS DISTINCT FROM 'rejected'
LEFT JOIN items itm ON itm.id = reg.item_id
LEFT JOIN results res ON res.registration_id = reg.id
WHERE p.status = 'approved';

GRANT SELECT ON public.vw_public_participants TO anon, authenticated;

-- Refresh postgrest schema definition
NOTIFY pgrst, 'reload schema';
