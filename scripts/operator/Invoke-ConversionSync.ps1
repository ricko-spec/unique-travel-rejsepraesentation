# Vision 3.0 Fase 5, Gate D (Issue #89) — kontrolleret, operatørstyret kald af
# production-sync-routen (GET /api/internal/conversion/sync), typisk til den
# FØRSTE baseline-kørsel efter at målingen er sat ACTIVE — så Ricko ikke skal
# vente på cron og kan se resultatet med det samme.
#
# Kræver: routen er deployet i production, og CRON_SECRET, HUBSPOT_PRIVATE_APP_TOKEN,
# HUBSPOT_DEAL_KEY_SECRET og BOOKING_MATCH_SECRET er sat i Vercel (Production).
# CRON_SECRET indtastes skjult (SecureString), lever kun i denne proces og
# ryddes i finally. Printer kun HTTP-status og routens kategoriske felter.
# Ingen retry: fejler kaldet, stoppes der (se runbookens stopbetingelser).
# Virker i både Windows PowerShell 5.1 og PowerShell 7.

$ErrorActionPreference = 'Stop'
$url = 'https://rejseplaner.uniquetravel.dk/api/internal/conversion/sync'
$secure = $null
$bstr = [IntPtr]::Zero
$client = $null
try {
    $secure = Read-Host -AsSecureString 'CRON_SECRET (vises ikke)'
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    Add-Type -AssemblyName System.Net.Http
    $client = New-Object System.Net.Http.HttpClient
    $client.Timeout = [TimeSpan]::FromSeconds(320)
    $req = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Get, $url)
    $req.Headers.TryAddWithoutValidation('Authorization', 'Bearer ' + [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)) | Out-Null
    $res = $client.SendAsync($req).GetAwaiter().GetResult()
    $status = [int]$res.StatusCode
    $text = $res.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    $req.Dispose()
    Write-Output ("HTTP-status: {0}" -f $status)
    try {
        $j = $text | ConvertFrom-Json
        # Kun de kategoriske felter — routen returnerer i forvejen intet andet.
        Write-Output ("result={0} errorCode={1} baseline={2} observed={3} auditRecorded={4}" -f $j.result, $j.errorCode, $j.baseline, $j.observed, $j.auditRecorded)
    } catch {
        Write-Output 'Svaret var ikke gyldig JSON (fx timeout eller platformsfejl) — se Vercel-logs for [conversion-sync].'
    }
} catch {
    # Kun exception-typen; aldrig beskeder, der kan indeholde request-detaljer.
    Write-Output ("FEJL: {0}" -f $_.Exception.GetType().Name)
} finally {
    if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    if ($secure) { $secure.Dispose() }
    if ($client) { $client.Dispose() }
    try { Set-Clipboard -Value ' ' } catch { }
    Write-Output 'Oprydning: secret, BSTR, HTTP-klient og clipboard ryddet.'
}
