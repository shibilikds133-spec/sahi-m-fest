-- Backfill row-level public visibility only for results that were already public
-- under the previous festival-level leaderboard visibility model.
--
-- New core publishes remain internal-only by default (public_visible = false).
-- Draft/ready/hidden/archived rows are not exposed.

UPDATE public.results AS res
SET public_visible = true
FROM public.festival_leaderboard_settings AS settings
WHERE settings.festival_id = res.festival_id
  AND COALESCE(settings.is_public_visible, false) IS TRUE
  AND res.published IS TRUE
  AND COALESCE(res.result_status, 'draft') = 'published'
  AND COALESCE(res.public_visible, false) IS FALSE;

NOTIFY pgrst, 'reload schema';
