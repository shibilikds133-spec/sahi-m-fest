const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://szhwkngspodujiqzblab.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6aHdrbmdzcG9kdWppcXpibGFiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTk0NTExMywiZXhwIjoyMDkxNTIxMTEzfQ.AA6_F8z223C7DX07KtntvqzowF-y4OVGRjTt5VCTeEw'); 
async function fixUrls() {
  const { data: templates } = await supabase.from('poster_templates').select('id, background_url');
  if(!templates) return;
  for (const t of templates) {
    if (t.background_url && t.background_url.includes('sahi-assets') && t.background_url.includes('?')) {
      const url = new URL(t.background_url);
      const objectKey = url.pathname.substring(1);
      const r2Url = 'r2://' + objectKey;
      await supabase.from('poster_templates').update({ background_url: r2Url }).eq('id', t.id);
      console.log('Updated ' + t.id + ': ' + r2Url);
    }
  }
}
fixUrls();
