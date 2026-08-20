-- Persist the generated Team Leader login identity so tenant admins can
-- reference the code and email after the initial account-creation response.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS team_leader_code text,
  ADD COLUMN IF NOT EXISTS team_leader_email text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_team_leader_code_unique
  ON public.profiles (team_leader_code)
  WHERE team_leader_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_team_leader_email_idx
  ON public.profiles (team_leader_email)
  WHERE team_leader_email IS NOT NULL;

NOTIFY pgrst, 'reload schema';
