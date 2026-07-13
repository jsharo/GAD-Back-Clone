Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:DemoRepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$script:DemoTempRoot = Join-Path $env:TEMP 'gad-canar-demo'
$script:DemoLogsRoot = Join-Path $script:DemoTempRoot 'logs'
$script:DemoStatePath = Join-Path $script:DemoTempRoot 'state.json'

function Write-DemoStatus {
    param([ValidateSet('PASS', 'WARN', 'FAIL', 'INFO')] [string] $Status, [string] $Message)
    Write-Host ("[{0}] {1}" -f $Status, $Message)
}

function Convert-DemoPathForComparison {
    param([Parameter(Mandatory = $true)] [string] $Path)
    return ([System.IO.Path]::GetFullPath($Path).TrimEnd('\', '/') -replace '\\', '/').ToLowerInvariant()
}

function Assert-DemoRepositoryRoot {
    if (-not (Test-Path -LiteralPath (Join-Path $script:DemoRepositoryRoot 'package.json') -PathType Leaf)) {
        throw ("No se encontro package.json en la raiz demo resuelta: {0}" -f $script:DemoRepositoryRoot)
    }
    if (-not (Test-Path -LiteralPath (Join-Path $script:DemoRepositoryRoot '.git'))) {
        throw ("No se encontro .git en la raiz demo resuelta: {0}" -f $script:DemoRepositoryRoot)
    }
    $gitRoot = (& git -C $script:DemoRepositoryRoot rev-parse --show-toplevel 2>$null)
    if ($LASTEXITCODE -ne 0 -or -not $gitRoot) {
        throw ("Git no pudo resolver la raiz del repositorio demo: {0}" -f $script:DemoRepositoryRoot)
    }
    if ((Convert-DemoPathForComparison $script:DemoRepositoryRoot) -ne (Convert-DemoPathForComparison $gitRoot.Trim())) {
        throw ("Raiz Git inesperada. RepoRoot={0}; GitRoot={1}" -f $script:DemoRepositoryRoot, $gitRoot.Trim())
    }
}

Assert-DemoRepositoryRoot

function Initialize-DemoTempRoot {
    if (-not (Test-Path $script:DemoTempRoot)) {
        New-Item -ItemType Directory -Path $script:DemoTempRoot -Force | Out-Null
    }
    if (-not (Test-Path $script:DemoLogsRoot)) {
        New-Item -ItemType Directory -Path $script:DemoLogsRoot -Force | Out-Null
    }
}

function Get-DemoState {
    if (-not (Test-Path $script:DemoStatePath)) { return $null }
    return Get-Content -LiteralPath $script:DemoStatePath -Raw | ConvertFrom-Json
}

function Save-DemoState {
    param([Parameter(Mandatory = $true)] $State)
    Initialize-DemoTempRoot
    $State | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $script:DemoStatePath -Encoding UTF8
}

function Test-DemoPort {
    param([Parameter(Mandatory = $true)] [int] $Port)
    try {
        $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Where-Object { $null -ne $_ })
        return $listeners.Count -gt 0
    } catch {
        return (netstat -ano | Select-String (":" + $Port + "\\s")).Count -gt 0
    }
}

function Get-DemoListeningProcessId {
    param([Parameter(Mandatory = $true)] [int] $Port)
    try {
        $connection = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($connection) { return [int]$connection.OwningProcess }
    } catch {
        return $null
    }
    return $null
}

function Test-DemoHttp {
    param([Parameter(Mandatory = $true)] [string] $Uri, [string] $Method = 'GET')
    try {
        $response = Invoke-WebRequest -Uri $Uri -Method $Method -UseBasicParsing -TimeoutSec 5
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 400
    } catch {
        return $false
    }
}

function Wait-DemoHttp {
    param([Parameter(Mandatory = $true)] [string] $Uri, [int] $TimeoutSeconds = 45, [string] $Method = 'GET')
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-DemoHttp -Uri $Uri -Method $Method) { return $true }
        Start-Sleep -Milliseconds 750
    }
    return $false
}

function Get-DemoKuboPath {
    param([string] $IpfsPath)
    if ($IpfsPath -and (Test-Path $IpfsPath -PathType Leaf)) { return (Resolve-Path $IpfsPath).Path }
    $command = Get-Command ipfs -ErrorAction SilentlyContinue
    if ($command -and (Test-Path $command.Source -PathType Leaf)) { return $command.Source }
    $fallback = 'C:\Tools\kubo\kubo\ipfs.exe'
    if (Test-Path $fallback -PathType Leaf) { return $fallback }
    return $null
}

function Test-DemoIpfsApi {
    # Kubo can reject Invoke-WebRequest with a 403 while accepting the same local API call.
    # curl.exe performs the request without adding a browser-like Origin header.
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    if (-not $curl) { return $false }
    $status = & $curl.Source -s -o NUL -w '%{http_code}' -X POST --max-time 5 'http://127.0.0.1:5001/api/v0/version'
    return $LASTEXITCODE -eq 0 -and $status -eq '200'
}

function Wait-DemoIpfsApi {
    param([int] $TimeoutSeconds = 45)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-DemoIpfsApi) { return $true }
        Start-Sleep -Milliseconds 750
    }
    return $false
}

function Get-DemoHardhatChainId {
    try {
        $body = @{ jsonrpc = '2.0'; method = 'eth_chainId'; params = @(); id = 1 } | ConvertTo-Json -Compress
        $response = Invoke-WebRequest -Uri 'http://127.0.0.1:8545' -Method POST -ContentType 'application/json' -Body $body -UseBasicParsing -TimeoutSec 5
        $value = ($response.Content | ConvertFrom-Json).result
        if (-not $value) { return $null }
        return [Convert]::ToInt64($value.Substring(2), 16)
    } catch {
        return $null
    }
}

function Test-DemoPostgres {
    Push-Location $script:DemoRepositoryRoot
    try {
        & npx.cmd prisma migrate status *> $null
        return $LASTEXITCODE -eq 0
    } finally {
        Pop-Location
    }
}

function Get-DemoEnvironmentNames {
    $envFile = Join-Path $script:DemoRepositoryRoot '.env'
    if (-not (Test-Path $envFile)) { return @() }
    return @(
        Get-Content -LiteralPath $envFile |
            Where-Object { $_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=' } |
            ForEach-Object { ([regex]::Match($_, '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=')).Groups[1].Value }
    )
}

function Start-DemoProcess {
    param(
        [Parameter(Mandatory = $true)] [string] $FilePath,
        [string[]] $ArgumentList = @(),
        [Parameter(Mandatory = $true)] [string] $Name,
        [switch] $DiscardOutput
    )
    Initialize-DemoTempRoot
    if ($DiscardOutput) {
        return Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -WorkingDirectory $script:DemoRepositoryRoot -WindowStyle Hidden -PassThru
    }
    $stdout = Join-Path $script:DemoLogsRoot ($Name + '.out.log')
    $stderr = Join-Path $script:DemoLogsRoot ($Name + '.err.log')
    return Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -WorkingDirectory $script:DemoRepositoryRoot -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
}

function Stop-DemoManagedProcess {
    param($ProcessState, [int[]] $ExpectedPorts = @())
    if (-not $ProcessState -or -not $ProcessState.started_by_demo) { return }
    $candidateIds = @()
    if ($ProcessState.pid) { $candidateIds += [int]$ProcessState.pid }
    foreach ($port in $ExpectedPorts) {
        $listenerPid = Get-DemoListeningProcessId -Port $port
        if ($listenerPid) { $candidateIds += $listenerPid }
    }
    foreach ($processId in ($candidateIds | Select-Object -Unique)) {
        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if (-not $process) { continue }
        if ($ProcessState.process_name -and $processId -eq [int]$ProcessState.pid -and $process.ProcessName -ne $ProcessState.process_name) {
            Write-DemoStatus WARN ("PID {0} no coincide con el proceso registrado; no se detiene." -f $processId)
            continue
        }
        $previousErrorActionPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            & taskkill.exe /PID $processId /T /F 1>$null 2>$null
        } finally {
            $ErrorActionPreference = $previousErrorActionPreference
        }
    }
}

function Get-DemoHardhatLocalKey {
    # Derive the standard local-only account in memory from Hardhat's installed defaults.
    # It is never written to the repository, demo state, documentation, or log files.
    $nodeScript = @'
const config = require('hardhat/internal/core/config/default-config');
const wallet = require('ethers').HDNodeWallet.fromPhrase(config.HARDHAT_NETWORK_MNEMONIC);
process.stdout.write(wallet.privateKey);
'@
    $key = & node.exe -e $nodeScript
    if ($LASTEXITCODE -ne 0 -or $key -notmatch '^0x[0-9a-fA-F]{64}$') { return $null }
    return $key
}

function Remove-DemoSensitiveLogLines {
    param([Parameter(Mandatory = $true)] [string] $LogPath)
    if (-not (Test-Path $LogPath)) { return $true }
    try {
        $redactFollowingLine = $false
        $sanitized = foreach ($line in Get-Content -LiteralPath $LogPath) {
            if ($redactFollowingLine) {
                $redactFollowingLine = $false
                $line -replace '0x[0-9a-fA-F]{64}', '[REDACTED]'
                continue
            }
            if ($line -match '(?i)private key:') {
                if ($line -match '0x[0-9a-fA-F]{64}') {
                    $line -replace '0x[0-9a-fA-F]{64}', '[REDACTED]'
                } else {
                    $redactFollowingLine = $true
                    $line
                }
                continue
            }
            $line
        }
        $sanitized | Set-Content -LiteralPath $LogPath -Encoding UTF8
        return $true
    } catch [System.IO.IOException] {
        # The active Hardhat writer locks its log on Windows. stop-demo sanitizes it
        # immediately after that process has been terminated.
        return $false
    }
}

function Get-DemoContractCode {
    param([Parameter(Mandatory = $true)] [string] $Address)
    try {
        $body = @{ jsonrpc = '2.0'; method = 'eth_getCode'; params = @($Address, 'latest'); id = 1 } | ConvertTo-Json -Compress
        $response = Invoke-WebRequest -Uri 'http://127.0.0.1:8545' -Method POST -ContentType 'application/json' -Body $body -UseBasicParsing -TimeoutSec 5
        $code = ($response.Content | ConvertFrom-Json).result
        return $code -and $code -ne '0x'
    } catch {
        return $false
    }
}
