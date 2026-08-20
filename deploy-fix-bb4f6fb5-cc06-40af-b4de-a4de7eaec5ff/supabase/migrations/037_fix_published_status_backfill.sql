-- ============================================================
-- SAHI WEB: RESULT STATUS BACKFILL + UNIQUE CONSTRAINT FIX
-- Run this in Supabase SQL Editor.
-- ============================================================

-- STEP 1: Backfill result_status for rows published=TRUE but result_status is not 'published'
-- This fixes the 2 items published from committee that didn't reach the leaderboard.
UPDATE results
SET result_status = 'published'
WHERE published IS TRUE
  AND COALESCE(result_status, 'draft') != 'published';

-- STEP 2: Add unique constraint on (registration_id, item_id) to support upsert correctly.
-- This enables safe re-publishing without creating duplicate rows.
-- NOTE: If this errors with "already exists", skip it — it's already in place.
ALTER TABLE results
  DROP CONSTRAINT IF EXISTS results_registration_id_item_id_key;

ALTER TABLE results
  ADD CONSTRAINT results_registration_id_item_id_key
  UNIQUE (registration_id, item_id);

-- STEP 3: Verify — confirm all published rows now have result_status = 'published'
SELECT
  COUNT(*) FILTER (WHERE published IS TRUE AND result_status = 'published') AS correctly_published,
  COUNT(*) FILTER (WHERE published IS TRUE AND result_status != 'published') AS still_broken,
  COUNT(*) FILTER (WHERE published IS TRUE AND result_status IS NULL)        AS null_status
FROM results;

-- STEP 4: Quick leaderboard sanity check — run this to see totals per unit
SELECT
  org.name AS unit_name,
  COUNT(*) AS result_count,
  SUM(res.points_awarded) AS total_points
FROM results res
LEFT JOIN registrations reg ON reg.id = res.registration_id
LEFT JOIN participants p ON p.id = reg.participant_id
LEFT JOIN organisations org ON org.id = COALESCE(reg.organisation_id, p.organisation_id)
WHERE res.published IS TRUE
  AND res.result_status = 'published'
GROUP BY org.name
ORDER BY total_points DESC;
