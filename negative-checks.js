const url = 'https://szhwkngspodujiqzblab.supabase.co/rest/v1/rpc';
const anonKey = 'sb_publishable_kgQJRDrtXp_RZu9QzIOh8g_USfkltfc';

async function checkApi() {
  const fetch = (await import('node-fetch')).default;
  
  // 1. Check anon access to execute_junior_import_chunk
  const res1 = await fetch(`${url}/execute_junior_import_chunk`, {
    method: 'POST',
    headers: {
      'apikey': anonKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      p_tenant_id: '00000000-0000-0000-0000-000000000000',
      p_festival_id: '00000000-0000-0000-0000-000000000000',
      p_session_id: '00000000-0000-0000-0000-000000000000',
      p_participants: []
    })
  });
  console.log('execute_junior_import_chunk (anon):', res1.status, await res1.text());

  // 2. Check anon access to _assert_import_access
  const res2 = await fetch(`${url}/_assert_import_access`, {
    method: 'POST',
    headers: {
      'apikey': anonKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      p_target_tenant_id: '00000000-0000-0000-0000-000000000000',
      p_target_festival_id: '00000000-0000-0000-0000-000000000000'
    })
  });
  console.log('_assert_import_access (anon):', res2.status, await res2.text());
}
checkApi();
