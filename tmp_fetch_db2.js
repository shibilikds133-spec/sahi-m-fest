const fs = require('fs');

async function check() {
  const url = 'https://szhwkngspodujiqzblab.supabase.co/rest/v1/registrations?select=id,item_id,participant_id,is_group_registration,raw_group_members,group_members(id,participant_id)&limit=20';
  const headers = {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6aHdrbmdzcG9kdWppcXpibGFiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTk0NTExMywiZXhwIjoyMDkxNTIxMTEzfQ.AA6_F8z223C7DX07KtntvqzowF-y4OVGRjTt5VCTeEw',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6aHdrbmdzcG9kdWppcXpibGFiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTk0NTExMywiZXhwIjoyMDkxNTIxMTEzfQ.AA6_F8z223C7DX07KtntvqzowF-y4OVGRjTt5VCTeEw'
  };

  try {
    const res = await fetch(url, { headers });
    const data = await res.json();
    console.log(JSON.stringify(data.filter(r => r.is_group_registration === true).slice(0, 5), null, 2));
    console.log("Found group registrations:", data.filter(r => r.is_group_registration === true).length);
  } catch(e) {
    console.error(e);
  }
}

check();
