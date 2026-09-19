const { Client } = require("pg");

const sql = `
BEGIN;

CREATE OR REPLACE FUNCTION public.unlock_schedule_marks(
  p_schedule_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Unlock ALL mark entries for the specified schedule
  UPDATE public.mark_entries
  SET is_final = false
  WHERE schedule_id = p_schedule_id;

  -- 2. Revert results status to draft if it's already published or ready
  UPDATE public.results
  SET result_status = 'draft',
      published = false
  WHERE schedule_id = p_schedule_id
    AND result_status IN ('published', 'ready');
END;
$$;

GRANT EXECUTE ON FUNCTION public.unlock_schedule_marks(UUID) TO authenticated;

COMMIT;
`;

async function run() {
  const client = new Client({
    connectionString: "postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres"
  });

  try {
    await client.connect();
    console.log("Connected to DB.");
    await client.query(sql);
    console.log("RPC updated successfully!");
  } catch (err) {
    console.error("Error executing SQL:", err);
  } finally {
    await client.end();
  }
}

run();
