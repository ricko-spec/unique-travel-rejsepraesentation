# Vision 3.0 Fase 5, Gate C1 (Issue #84) — Fase C3: én operatørstyret,
# write-free dry-run. Køres af Ricko fra repo-roden på Gate C1-branchen
# (node_modules installeret). Tre secrets indtastes skjult; de lever kun i
# denne proces og ryddes i finally (env-vars, BSTR'er, clipboard).
# Kører: node --import ./scripts/operator/ts-hooks.mjs scripts/operator/conversion-dry-run.ts
# Printer kun aggregater. Ingen retry: fejler den, stoppes der.

$ErrorActionPreference = 'Stop'
$names = @('HUBSPOT_PRIVATE_APP_TOKEN', 'BOOKING_MATCH_SECRET', 'SUPABASE_SERVICE_ROLE_KEY')
$prompts = @{
    HUBSPOT_PRIVATE_APP_TOKEN = 'HubSpot Private App-token (read-only, vises ikke)'
    BOOKING_MATCH_SECRET      = 'BOOKING_MATCH_SECRET (vises ikke)'
    SUPABASE_SERVICE_ROLE_KEY = 'Supabase service-role-nøgle for iunixfpthdftmkgpugex (vises ikke)'
}
$bstrs = @()
$secures = @()
try {
    if (-not (Test-Path './scripts/operator/conversion-dry-run.ts')) { throw 'Kør fra repo-roden på Gate C1-branchen.' }
    foreach ($n in $names) {
        $s = Read-Host -AsSecureString $prompts[$n]
        $secures += $s
        $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
        $bstrs += $b
        Set-Item -Path "Env:\$n" -Value ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($b))
    }
    node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/operator/ts-hooks.mjs scripts/operator/conversion-dry-run.ts
    Write-Output ("node exit code: {0}" -f $LASTEXITCODE)
} catch {
    Write-Output ("FEJL: {0}" -f $_.Exception.Message)
} finally {
    foreach ($b in $bstrs) { if ($b -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) } }
    foreach ($s in $secures) { if ($s) { $s.Dispose() } }
    foreach ($n in $names + @('HUBSPOT_DEAL_KEY_SECRET')) { Remove-Item "Env:\$n" -ErrorAction SilentlyContinue }
    try { Set-Clipboard -Value ' ' } catch { }
    Write-Output 'Oprydning: secrets-variabler, BSTR''er og clipboard ryddet.'
}
