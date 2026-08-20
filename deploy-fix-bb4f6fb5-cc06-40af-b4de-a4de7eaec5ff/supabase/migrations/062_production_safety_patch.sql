-- Migration 061: Production Safety Indexes
-- Add performance indexes for leaderboard
COMMIT; -- Break out of Supabase migration transaction to use CONCURRENTLY

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_results_public_leaderboard
ON public.results(
  festival_id,
  published,
  result_status,
  published_at
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_registrations_org_participant
ON public.registrations(
  organisation_id,
  participant_id
);
