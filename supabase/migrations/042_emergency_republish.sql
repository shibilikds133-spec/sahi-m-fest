-- ============================================================
-- SAHI WEB: 041 — EMERGENCY FIX: Re-publish hidden results
-- The backfill migration 040 incorrectly hid all results
-- because hidden rows still had published_at set (from old data).
-- This migration restores result_status = 'published' for all
-- rows that have published = false but result_status = 'published'.
-- ============================================================

-- Re-publish rows that were incorrectly hidden
UPDATE results
SET published = true
WHERE result_status = 'published'
  AND published = false;

-- Verify
SELECT
  result_status,
  published,
  COUNT(*) AS row_count,
  COUNT(published_at) AS with_timestamp
FROM results
GROUP BY result_status, published
ORDER BY result_status;
