const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const festId = "7ebe465a-8c64-4366-8faa-d04ff5d4b3d7";
  const tenantId = "f87172d1-ed27-4db4-842c-cc00d3d56de2";
  const { data, error } = await supabase.rpc("get_strategic_publish_order", {
    p_festival_id: festId,
    p_tenant_id: tenantId
  });
  console.log("Error:", error);
  console.log("Data:", data);
}
run();
