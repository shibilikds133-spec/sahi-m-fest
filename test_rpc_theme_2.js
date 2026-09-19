const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: orgs } = await supabase.from("tenants").select("id").limit(1);
  if (orgs.length > 0) {
    const { data, error } = await supabase.rpc("get_public_leaderboard_settings", {
      p_tenant_id: orgs[0].id
    });
    console.log(data);
  }
}
run();
