-- Forward-only reconciliation for historical migrations that were applied
-- outside Supabase migration history. Do not replay migrations 008, 047, 078,
-- or either duplicate 082 file against a populated database.

BEGIN;

-- Migration 008 is intentionally not replayed because it deletes and recreates
-- an auth user. Require every current superadmin profile to retain a linked
-- email identity before accepting the historical state.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.profiles profile
    JOIN auth.users auth_user ON auth_user.id = profile.id
    WHERE profile.is_superadmin IS TRUE
      AND NOT EXISTS (
        SELECT 1
        FROM auth.identities identity_row
        WHERE identity_row.user_id = auth_user.id
          AND identity_row.provider = 'email'
      )
  ) THEN
    RAISE EXCEPTION
      'Historical migration 008 cannot be accepted: a superadmin email identity is missing.';
  END IF;
END;
$$;

-- Complete migration 047's public-visibility invariant. Its predicate is
-- deliberately repeated exactly so unrelated or unpublished results remain
-- untouched.
UPDATE public.results AS result_row
SET public_visible = true
FROM public.festival_leaderboard_settings AS settings
WHERE settings.festival_id = result_row.festival_id
  AND COALESCE(settings.is_public_visible, false) IS TRUE
  AND result_row.published IS TRUE
  AND COALESCE(result_row.result_status, 'draft') = 'published'
  AND COALESCE(result_row.public_visible, false) IS FALSE;

-- Complete migration 078's dangling-token repair without losing provenance.
-- Such tokens can never authorise a mark because their schedule is gone.
-- The historical migration attempted to clear schedule_id but did not remove
-- the legacy NOT NULL constraint first, so make the intended nullable state
-- explicit before quarantining those rows.
ALTER TABLE public.judge_tokens
  ALTER COLUMN schedule_id DROP NOT NULL;

UPDATE public.judge_tokens AS token_row
SET original_schedule_id = COALESCE(token_row.original_schedule_id, token_row.schedule_id),
    schedule_id = NULL,
    is_revoked = true,
    revoked_at = COALESCE(token_row.revoked_at, now()),
    revocation_reason = COALESCE(
      token_row.revocation_reason,
      'Dangling token reconciled after schedule deletion'
    ),
    status = CASE
      WHEN token_row.status IN ('created', 'pending_approval', 'approved')
        THEN 'rejected'
      ELSE token_row.status
    END
WHERE token_row.schedule_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.schedules schedule
    WHERE schedule.id = token_row.schedule_id
  );

-- Migration 083 is the canonical implementation that supersedes both
-- conflicting 082 function bodies. Remove the role-specific anonymous grant
-- left by the first 082 file; token generation is an authenticated admin task.
REVOKE ALL ON FUNCTION public.generate_judge_token(
  uuid, uuid, uuid, uuid, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_judge_token(
  uuid, uuid, uuid, uuid, boolean
) TO authenticated;

COMMENT ON FUNCTION public.generate_judge_token(
  uuid, uuid, uuid, uuid, boolean
) IS
  'Canonical judge token generator from migration 083; supersedes both historical 082 definitions.';

-- Fail atomically if any reconciliation invariant remains unresolved.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.results AS result_row
    JOIN public.festival_leaderboard_settings AS settings
      ON settings.festival_id = result_row.festival_id
    WHERE COALESCE(settings.is_public_visible, false) IS TRUE
      AND result_row.published IS TRUE
      AND COALESCE(result_row.result_status, 'draft') = 'published'
      AND COALESCE(result_row.public_visible, false) IS FALSE
  ) THEN
    RAISE EXCEPTION 'Migration 047 visibility reconciliation is incomplete.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.judge_tokens AS token_row
    WHERE token_row.schedule_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.schedules AS schedule
        WHERE schedule.id = token_row.schedule_id
      )
  ) THEN
    RAISE EXCEPTION 'Migration 078 dangling-token reconciliation is incomplete.';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
