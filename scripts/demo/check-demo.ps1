[CmdletBinding()]
param([switch] $SkipCriticalTests)

. (Join-Path $PSScriptRoot 'common.ps1')
$state = Get-DemoState
if (-not $state) { throw 'No existe state.json de una sesion demo gestionada. Ejecute demo:start primero.' }
$failures = 0
function Check-Step { param([string] $Name, [scriptblock] $Check) if (& $Check) { Write-DemoStatus PASS $Name } else { Write-DemoStatus FAIL $Name; $script:failures++ } }

function Invoke-DemoGitQuiet {
    param([Parameter(Mandatory = $true)] [string[]] $Arguments)
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = & git -C $script:DemoRepositoryRoot @Arguments 2>$null
        return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = $output }
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
}

Push-Location $script:DemoRepositoryRoot
try {
    Check-Step 'PostgreSQL: READY' { Test-DemoPostgres }
    Check-Step 'Backend / Swagger: READY' { Test-DemoHttp -Uri 'http://localhost:3000/api/docs' }
    Check-Step 'IPFS API: READY' { Test-DemoIpfsApi }
    Check-Step 'IPFS Gateway port: READY' { Test-DemoPort 8080 }
    Check-Step 'Hardhat: READY' { (Get-DemoHardhatChainId) -eq 31337 }
    Check-Step 'Contract: READY' { Get-DemoContractCode -Address $state.contract_address }
    if (-not $SkipCriticalTests) { Check-Step 'Critical tests: PASS' { & npm.cmd run test:critical *> $null; $LASTEXITCODE -eq 0 } }
    Check-Step 'Git diff --check: PASS' { (Invoke-DemoGitQuiet @('diff', '--check')).ExitCode -eq 0 }
    Check-Step 'Git: CLEAN' { -not (Invoke-DemoGitQuiet @('status', '--porcelain')).Output }
    Check-Step '.env no modificado' { -not (Invoke-DemoGitQuiet @('diff', '--', '.env')).Output }
} finally { Pop-Location }
if ($failures -gt 0) { exit 1 }
Write-DemoStatus PASS 'Verificacion demo completa.'
