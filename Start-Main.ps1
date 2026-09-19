# Start-Main.ps1
$env:EXPO_PUBLIC_SUPABASE_URL="https://szhwkngspodujiqzblab.supabase.co"
$env:EXPO_PUBLIC_SUPABASE_ANON_KEY="sb_publishable_kgQJRDrtXp_RZu9QzIOh8g_USfkltfc"
Write-Host "Starting MAIN Database on Port 8081..." -ForegroundColor Green
npx expo start -c --port 8081 --web
