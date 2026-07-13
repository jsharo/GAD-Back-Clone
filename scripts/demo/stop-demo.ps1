[CmdletBinding()]
param([switch] $CleanLogs)

. (Join-Path $PSScriptRoot 'common.ps1')
$state = Get-DemoState
if (-not $state) {
    if ($CleanLogs -and (Test-Path $script:DemoLogsRoot)) { Remove-Item -LiteralPath $script:DemoLogsRoot -Recurse -Force }
    Write-DemoStatus WARN 'No existe una sesion demo gestionada; no se detienen procesos por puerto.'
    exit 0
}

Stop-DemoManagedProcess $state.backend -ExpectedPorts @(3000)
Stop-DemoManagedProcess $state.hardhat -ExpectedPorts @(8545)
Stop-DemoManagedProcess $state.kubo -ExpectedPorts @(5001, 8080)
if (Test-Path $script:DemoLogsRoot) {
    Get-ChildItem -LiteralPath $script:DemoLogsRoot -Filter '*.log' -File | ForEach-Object {
        Remove-DemoSensitiveLogLines -LogPath $_.FullName | Out-Null
    }
}
if (Test-Path $script:DemoStatePath) { Remove-Item -LiteralPath $script:DemoStatePath -Force }
if ($CleanLogs -and (Test-Path $script:DemoLogsRoot)) { Remove-Item -LiteralPath $script:DemoLogsRoot -Recurse -Force }
if (Test-Path $script:DemoTempRoot) {
    Get-ChildItem -LiteralPath $script:DemoTempRoot -Filter 'hardhat-bootstrap.log' -ErrorAction SilentlyContinue | Remove-Item -Force
}
foreach ($port in @(3000, 5001, 8080, 8545)) {
    if (Test-DemoPort $port) { Write-DemoStatus WARN ("Puerto {0} permanece activo por un servicio preexistente." -f $port) } else { Write-DemoStatus PASS ("Puerto {0} libre." -f $port) }
}
Write-DemoStatus PASS 'Sesion demo detenida. PostgreSQL nunca fue administrado por este script.'
