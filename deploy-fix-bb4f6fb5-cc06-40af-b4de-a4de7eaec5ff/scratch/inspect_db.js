const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  // Sign in as admin to read pg_policies
  await supabase.auth.signInWithPassword({
    email: 'shibilikds938@gmail.com',
    password: 'm1o2n3u4'
  });
  
  const { data: policies, error: polErr } = await supabase.rpc('get_policies_temp');
  // Since rpc get_policies_temp might not exist, we can use a raw sql query if we have an RPC, or just query pg_policies using an RPC if available.
  // Wait, let's see if there is an RPC we can use or if we can run query on pg_policies via supabase.from() - wait, we can't query pg_catalog tables directly via PostgREST unless there is a view or RPC.
  // Let's see if we can read the policies by querying public.items as an authenticated admin.
  console.log('Querying items as admin user...');
  const { data: adminItems, error: adminErr } = await supabase.from('items').select('id, item_code, item_name_en, is_active').limit(5);
  console.log('Admin Items response:', adminItems, 'Error:', adminErr);

  // Print registrations for scheduled items
  const itemIds = ['9c9075c0-e17b-45f1-b17d-864d7e313bef', '0a77b4bd-dc3e-43a8-9054-bce53d9b5b22', '325d0556-2060-4a2e-9653-d58d7f39ba54'];
  const { data: regs, error: regsErr } = await supabase.from('registrations').select('id, item_id, tenant_id, participant_id, status, is_verified').in('item_id', itemIds);
  console.log('Registrations for scheduled items:', regs);
  console.log('Error if any:', regsErr);

  // Let's also check if they are logged into a different tenant or if RLS is hiding them
  const { data: profile } = await supabase.from('profiles').select('*');
  console.log('Admin profiles:', profile);
}

run();
