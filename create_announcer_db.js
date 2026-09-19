const { Client } = require("pg");

async function run() {
  const client = new Client({
    connectionString: "postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres"
  });

  try {
    await client.connect();
    
    // 1. Create announcer_tokens table
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.announcer_tokens (
        id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
        tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
        festival_id uuid NOT NULL REFERENCES public.festival_calendar(id) ON DELETE CASCADE,
        token text NOT NULL UNIQUE,
        is_active boolean NOT NULL DEFAULT true,
        created_by uuid NOT NULL REFERENCES auth.users(id),
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        expires_at timestamp with time zone,
        CONSTRAINT announcer_tokens_pkey PRIMARY KEY (id)
      );
    `);

    // Enable RLS on announcer_tokens
    await client.query(`ALTER TABLE public.announcer_tokens ENABLE ROW LEVEL SECURITY;`);

    // Drop policies if exist
    await client.query(`DROP POLICY IF EXISTS "Tenant admins can manage announcer tokens" ON public.announcer_tokens;`);
    await client.query(`DROP POLICY IF EXISTS "Public can view active announcer tokens" ON public.announcer_tokens;`);

    // Create policies
    await client.query(`
      CREATE POLICY "Tenant admins can manage announcer tokens" ON public.announcer_tokens
        FOR ALL USING (
          public.is_superadmin() OR tenant_id = public.get_my_tenant_id()
        );
    `);

    await client.query(`
      CREATE POLICY "Public can view active announcer tokens" ON public.announcer_tokens
        FOR SELECT USING (is_active = true);
    `);

    // 2. Create toggle_announcer_result_visibility RPC
    await client.query(`
      CREATE OR REPLACE FUNCTION public.toggle_announcer_result_visibility(p_token text, p_item_id uuid, p_is_public boolean)
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path TO 'public'
      AS $function$
      DECLARE
        v_token_record RECORD;
      BEGIN
        -- Verify token
        SELECT * INTO v_token_record 
        FROM public.announcer_tokens 
        WHERE token = p_token AND is_active = true;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Invalid or inactive announcer token.';
        END IF;

        -- Check if it has expired
        IF v_token_record.expires_at IS NOT NULL AND v_token_record.expires_at < now() THEN
          RAISE EXCEPTION 'Announcer token has expired.';
        END IF;

        -- Update the result visibility for the item
        UPDATE public.results
        SET 
          public_visible = p_is_public,
          published_at = CASE WHEN p_is_public THEN now() ELSE published_at END
        WHERE item_id = p_item_id AND festival_id = v_token_record.festival_id;
      END;
      $function$;
    `);

    console.log("Database objects created successfully!");
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
