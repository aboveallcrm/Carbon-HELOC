$authBody = @{ email = 'barraganmortgage@gmail.com'; password = 'Goodlife2026$' } | ConvertTo-Json
$authResponse = Invoke-RestMethod -Uri 'https://czzabvfzuxhpdcowgvam.supabase.co/auth/v1/token?grant_type=password' -Method POST -Headers @{ apikey = 'sb_publishable_KjK4nHtyBK426zvT4EDDWA_U1FbWp-8'; 'Content-Type' = 'application/json' } -Body $authBody
$token = $authResponse.access_token
$headers = @{ apikey = 'sb_publishable_KjK4nHtyBK426zvT4EDDWA_U1FbWp-8'; Authorization = "Bearer $token"; 'Content-Type' = 'application/json' }

# Use RPC to query pg_policies (this bypasses RLS on profiles)
Write-Host "=== Profiles policies ==="
try {
    $r = Invoke-WebRequest -Uri 'https://czzabvfzuxhpdcowgvam.supabase.co/rest/v1/rpc/is_super_admin' -Method POST -Headers $headers -Body '{}' -UseBasicParsing
    Write-Host "is_super_admin: $($r.Content)"
} catch {
    Write-Host "is_super_admin error"
}
