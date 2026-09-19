# Start-Staging.ps1
$env:EXPO_PUBLIC_SUPABASE_URL="https://qpuzxoohyzjwdkhbxnjy.supabase.co"
$env:EXPO_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwdXp4b29oeXpqd2RraGJ4bmp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4MTE0NjgsImV4cCI6MjEwMzM4NzQ2OH0.-hQWxN8s_0-DCDrtOtgvST7zha5npsB3uruHawaiFPE"
Write-Host "Starting STAGING Database on Port 8082..." -ForegroundColor Yellow
npx expo start -c --port 8082 --web
