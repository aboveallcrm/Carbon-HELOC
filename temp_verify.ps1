$authBody = @{ email = 'barraganmortgage@gmail.com'; password = 'Goodlife2026$' } | ConvertTo-Json
$authResponse = Invoke-RestMethod -Uri 'https://czzabvfzuxhpdcowgvam.supabase.co/auth/v1/token?grant_type=password' -Method POST -Headers @{ apikey = 'sb_publishable_KjK4nHtyBK426zvT4EDDWA_U1FbWp-8'; 'Content-Type' = 'application/json' } -Body $authBody
$token = $authResponse.access_token
$headers = @{ apikey = 'sb_publishable_KjK4nHtyBK426zvT4EDDWA_U1FbWp-8'; Authorization = "Bearer $token" }

Write-Host "=== Test 1: profiles ==="
try {
    $r = Invoke-WebRequest -Uri 'https://czzabvfzuxhpdcowgvam.supabase.co/rest/v1/profiles?select=id,email,role,tier&id=eq.795aea13-6aba-45f2-97d4-04576f684557' -Headers $headers -UseBasicParsing
    Write-Host "OK: $($r.Content)"
} catch {
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    Write-Host "ERROR: $($reader.ReadToEnd())"
}

Write-Host "`n=== Test 2: leads ==="
try {
    $r2 = Invoke-WebRequest -Uri 'https://czzabvfzuxhpdcowgvam.supabase.co/rest/v1/leads?select=id&limit=1' -Headers $headers -UseBasicParsing
    Write-Host "OK: $($r2.Content)"
} catch {
    $reader2 = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    Write-Host "ERROR: $($reader2.ReadToEnd())"
}

Write-Host "`n=== Test 3: quotes ==="
try {
    $r3 = Invoke-WebRequest -Uri 'https://czzabvfzuxhpdcowgvam.supabase.co/rest/v1/quotes?select=id&limit=1' -Headers $headers -UseBasicParsing
    Write-Host "OK: $($r3.Content)"
} catch {
    $reader3 = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    Write-Host "ERROR: $($reader3.ReadToEnd())"
}
