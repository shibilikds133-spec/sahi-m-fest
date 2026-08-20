const fs = require('fs');

async function check() {
  const url = 'https://szhwkngspodujiqzblab.supabase.co/rest/v1/registrations?select=*,participants(*)&limit=5';
  const headers = {
    'apikey': 'sb_publishable_kgQJRDrtXp_RZu9QzIOh8g_USfkltfc',
    'Authorization': 'Bearer sb_publishable_kgQJRDrtXp_RZu9QzIOh8g_USfkltfc'
  };

  const res = await fetch(url, { headers });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

check();
