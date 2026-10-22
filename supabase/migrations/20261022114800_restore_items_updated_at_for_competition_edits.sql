BEGIN;

-- The competition metadata RPC uses items.updated_at as its optimistic
-- concurrency token. Restore the column if a database missed migration 016.
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

COMMIT;
