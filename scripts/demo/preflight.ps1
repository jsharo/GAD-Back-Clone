[CmdletBinding()]
param(
    [string] $IpfsPath,
    [switch] $SkipBuild,
    [switch] $SkipCriticalTests
)

. (Join-Path $PSScriptRoot 'common.ps1')

$failures = 0
function Test-Step {
    param([string] $Name, [scriptblock] $Check, [switch] $WarningOnly)
    try {
        if (& $Check) { Write-DemoStatus PASS $Name } elseif ($WarningOnly) { Write-DemoStatus WARN $Name } else { Write-DemoStatus FAIL $Name; $script:failures++ }
    } catch { if ($WarningOnly) { Write-DemoStatus WARN $Name } else { Write-DemoStatus FAIL $Name; $script:failures++ } }
}

Push-Location $script:DemoRepositoryRoot
try {
    Test-Step 'Node disponible' { $null -ne (Get-Command node -ErrorAction SilentlyContinue) }
    Test-Step 'npm disponible' { $null -ne (Get-Command npm.cmd -ErrorAction SilentlyContinue) }
    Test-Step 'package-lock.json presente' { Test-Path 'package-lock.json' }
    Test-Step 'node_modules presente' { Test-Path 'node_modules' } -WarningOnly
    Test-Step 'Archivo .env local presente' { Test-Path '.env' }
    $envNames = Get-DemoEnvironmentNames
    foreach ($requiredName in @('DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET')) {
        if ($envNames -contains $requiredName) {
            Write-DemoStatus PASS ("Variable local presente: {0}" -f $requiredName)
        } else {
            Write-DemoStatus FAIL ("Variable local presente: {0}" -f $requiredName)
            $failures++
        }
    }
    Test-Step 'Prisma disponible y esquema valido' { & npx.cmd prisma validate *> $null; $LASTEXITCODE -eq 0 }
    Test-Step 'PostgreSQL y migraciones accesibles' { Test-DemoPostgres }
    Test-Step 'Script db:seed disponible' { $scripts = Get-Content 'package.json' -Raw | ConvertFrom-Json; $null -ne $scripts.scripts.'db:seed' }
    Test-Step 'Hardhat disponible' { & npx.cmd hardhat --version *> $null; $LASTEXITCODE -eq 0 }
    Test-Step 'Contrato DocumentEvidenceRegistry presente' { Test-Path 'contracts\DocumentEvidenceRegistry.sol' }
    Test-Step 'Script de despliegue presente' { Test-Path 'scripts\deploy-document-evidence.js' }
    $kubo = Get-DemoKuboPath -IpfsPath $IpfsPath
    Test-Step 'Kubo localizado (PATH, parametro o fallback)' { $null -ne $kubo }
    Test-Step 'Carpeta uploads disponible o creable por backend' { (Test-Path 'uploads') -or (Test-Path '.') } -WarningOnly
    foreach ($port in @(3000, 5001, 8080, 8545)) { Test-Step ("Puerto {0} libre" -f $port) { -not (Test-DemoPort $port) } -WarningOnly }
    if (-not $SkipBuild) { Test-Step 'Build NestJS' { & npm.cmd run build *> $null; $LASTEXITCODE -eq 0 } }
    if (-not $SkipCriticalTests) { Test-Step 'Suite critica' { & npm.cmd run test:critical *> $null; $LASTEXITCODE -eq 0 } }
} finally { Pop-Location }

if ($failures -gt 0) { exit 1 }
Write-DemoStatus PASS 'Preflight completado sin fallos criticos.'
