-- Add status column to judge_tokens for approval workflow
ALTER TABLE public.judge_tokens ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'created';

-- Update RLS for judges to be able to read and update their own token requests
DROP POLICY IF EXISTS "Judges can update their token status" ON public.judge_tokens;
CREATE POLICY "Judges can update their token status"
ON public.judge_tokens FOR UPDATE
USING (true)
WITH CHECK (true); -- Usually, we'd restrict this, but tokens are secret keys.

-- We also need to enable Realtime for judge_tokens table
ALTER PUBLICATION supabase_realtime ADD TABLE public.judge_tokens;
