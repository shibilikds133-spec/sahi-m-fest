-- ============================================================
-- SAHI WEB: 040 — FULL PIPELINE FIX
-- Fixes:
--   1. Backfill published_at for existing published results
--      (frontend was not setting published_at, RPC depends on it)
--   2. Fix hidden results to have published_at = NULL and published = false
-- Run in Supabase SQL Editor.
-- ============================================================

-- 1. Backfill published_at for rows that are published but missing timestamp
UPDATE results
SET published_at = NOW()
WHERE result_status = 'published'
  AND published = true
  AND published_at IS NULL;

-- 2. Fix truly-hidden rows — ensure published = false and published_at = null
-- IMPORTANT: Only update rows where result_status is NOT 'published'
UPDATE results
SET published = false,
    published_at = NULL
WHERE result_status IN ('hidden', 'draft', 'ready', 'archived')
  AND result_status != 'published'
  AND published = true;

-- 3. Verify: show counts per status to confirm
SELECT
  result_status,
  published,
  COUNT(*) AS row_count,
  COUNT(published_at) AS with_timestamp,
  COUNT(*) - COUNT(published_at) AS missing_timestamp
FROM results
GROUP BY result_status, published
ORDER BY result_status;
