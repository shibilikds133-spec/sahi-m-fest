import { createClient } from '@supabase/supabase-js'
const supabase = createClient('https://szhwkngspodujiqzblab.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6aHdrbmdzcG9kdWppcXpibGFiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTk0NTExMywiZXhwIjoyMDkxNTIxMTEzfQ.AA6_F8z223C7DX07KtntvqzowF-y4OVGRjTt5VCTeEw')

async function check() {
  // we can just fetch 1 row from schedules to see the keys
  const { data, error } = await supabase.from('schedules').select('*').limit(1)
  console.log('Error:', error)
  if (data && data.length > 0) {
    console.log('Columns:', Object.keys(data[0]))
  } else {
    console.log('No data, lets try inserting to see error')
    const { error: err2 } = await supabase.from('schedules').insert({ stage_id: '123' })
    console.log('stage_id error:', err2)
    const { error: err3 } = await supabase.from('schedules').insert({ venue_id: '123' })
    console.log('venue_id error:', err3)
  }
}
check()
