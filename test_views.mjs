import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://qpuzxoohyzjwdkhbxnjy.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwdXp4b29oeXpqd2RraGJ4bmp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4MTE0NjgsImV4cCI6MjEwMzM4NzQ2OH0.-hQWxN8s_0-DCDrtOtgvST7zha5npsB3uruHawaiFPE'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function testViews() {
  const views = [
    'judge_submission_status',
    'vw_audit_invalid_results',
    'vw_audit_stuck_export_jobs',
    'vw_audit_duplicate_chest_numbers',
    'vw_audit_duplicate_registrations',
    'vw_audit_schedule_overlaps',
    'vw_audit_missing_item_mappings',
    'vw_audit_broken_participant_refs',
    'vw_audit_null_critical_fields',
    'vw_public_leaderboard',
    'vw_public_results',
    'vw_public_schedule',
    'vw_public_live_status',
    'vw_public_participants',
    'organisations',
    'profiles',
    'tenants'
  ]

  for (const view of views) {
    console.log('Testing', view)
    const { error } = await supabase.from(view).select('*').limit(1)
    if (error) {
      console.error('ERROR in', view, error.message)
    }
  }
}
testViews()
