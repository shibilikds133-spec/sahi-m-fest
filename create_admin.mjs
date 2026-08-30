import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://qpuzxoohyzjwdkhbxnjy.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwdXp4b29oeXpqd2RraGJ4bmp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4MTE0NjgsImV4cCI6MjEwMzM4NzQ2OH0.-hQWxN8s_0-DCDrtOtgvST7zha5npsB3uruHawaiFPE'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function run() {
  const email = 'admin@sahithyolsav.com'
  const password = 'Password123!'
  
  console.log('Signing up user...')
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: 'Staging Superadmin'
      }
    }
  })
  
  if (error) {
    console.error('Signup error:', error.message)
  } else {
    console.log('Signup success:', data.user?.id)
  }
}

run()
