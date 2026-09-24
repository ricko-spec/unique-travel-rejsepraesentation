# Vision 3.0 Fase 5, Gate C1 (Issue #84) — Fase C0: read-only HubSpot-metadata.
#
# Køres af Ricko i eget PowerShell. Tokenet indtastes skjult (Read-Host
# -AsSecureString), lever kun i denne proces og ryddes i finally (env-var,
# BSTR, clipboard). Kalder KUN to metadata-endpoints (GET):
#   /crm/v3/pipelines/deals/754595640
#   /crm/v3/properties/deals/{property}   for de seks krævede properties
# Printer KUN: pipeline-id/-label, stage-id, stage-label, displayOrder,
# stage-metadata (isClosed, probability), archived, samt property-navn/-type/
# -fieldType og — for unique_travel_dealstatus — option-værdier/-labels
# (feltets konfiguration, ikke dealdata). Ingen deals, ingen PII, intet token.
# Fejl vises kun som HTTP-statuskode — aldrig svar-body.

$ErrorActionPreference = 'Stop'
$pipelineId = '754595640'
$properties = @('pipeline', 'dealstage', 'unique_travel_bookingno', 'unique_travel_dealstatus', 'hs_is_closed', 'hs_is_closed_won')
$base = 'https://api.hubapi.com'
$bstr = [IntPtr]::Zero
$secure = $null

function Get-HubSpotJson([string]$path) {
    try {
        return Invoke-RestMethod -Method Get -Uri ($base + $path) -Headers @{ Authorization = "Bearer $($env:HUBSPOT_PRIVATE_APP_TOKEN)"; Accept = 'application/json' } -TimeoutSec 30
    } catch {
        $code = $null
        if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
        throw "HUBSPOT_METADATA_FAILED: HTTP $code ($path)"
    }
}

try {
    $secure = Read-Host -AsSecureString 'HubSpot Private App-token (read-only, vises ikke)'
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $env:HUBSPOT_PRIVATE_APP_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    if ([string]::IsNullOrWhiteSpace($env:HUBSPOT_PRIVATE_APP_TOKEN)) { throw 'TOKEN_MISSING' }

    $p = Get-HubSpotJson "/crm/v3/pipelines/deals/$pipelineId"
    Write-Output '=== GATE_C1_STAGE_METADATA (kun metadata, ingen deals) ==='
    Write-Output ("pipeline.id={0} pipeline.label={1} pipeline.archived={2} stages={3}" -f $p.id, $p.label, $p.archived, @($p.stages).Count)
    Write-Output 'displayOrder | stage.id | label | isClosed | probability | archived'
    foreach ($s in (@($p.stages) | Sort-Object { [int]$_.displayOrder })) {
        Write-Output ("{0} | {1} | {2} | {3} | {4} | {5}" -f $s.displayOrder, $s.id, $s.label, $s.metadata.isClosed, $s.metadata.probability, $s.archived)
    }

    Write-Output '=== GATE_C1_PROPERTY_METADATA ==='
    foreach ($name in $properties) {
        $prop = Get-HubSpotJson "/crm/v3/properties/deals/$name"
        Write-Output ("{0} | type={1} | fieldType={2} | calculated={3}" -f $prop.name, $prop.type, $prop.fieldType, $prop.calculated)
        if ($name -eq 'unique_travel_dealstatus') {
            foreach ($o in @($prop.options)) {
                Write-Output ("   option value='{0}' label='{1}' hidden={2}" -f $o.value, $o.label, $o.hidden)
            }
        }
    }
    Write-Output '=== SLUT (kopiér output fra "=== GATE_C1_STAGE_METADATA" til "=== SLUT") ==='
} catch {
    # Kun kategorisk fejl — aldrig token, header eller svar-body.
    Write-Output ("FEJL: {0}" -f ($_.Exception.Message -replace 'Bearer\s+\S+', 'Bearer ***'))
} finally {
    if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    if ($secure) { $secure.Dispose() }
    Remove-Item Env:\HUBSPOT_PRIVATE_APP_TOKEN -ErrorAction SilentlyContinue
    try { Set-Clipboard -Value ' ' } catch { }
    Write-Output 'Oprydning: token-variabel, BSTR og clipboard ryddet.'
}
