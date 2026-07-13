[CmdletBinding()]
param([string] $IpfsPath, [switch] $SkipSeed)

. (Join-Path $PSScriptRoot 'common.ps1')

if (Get-DemoState) { throw 'Existe una sesion demo gestionada. Ejecute demo:stop antes de iniciar otra.' }
& (Join-Path $PSScriptRoot 'preflight.ps1') -IpfsPath $IpfsPath -SkipBuild -SkipCriticalTests
if ($LASTEXITCODE -ne 0) { throw 'Preflight fallo. No se inicio el entorno.' }

$state = [ordered]@{
    started_at = (Get-Date).ToString('o')
    api_port = 3000
    chain_id = 31337
    network = 'hardhat-local'
    contract_address = $null
    backend = $null
    kubo = $null
    hardhat = $null
}

try {
    Push-Location $script:DemoRepositoryRoot
    if (-not $SkipSeed) { & npm.cmd run db:seed; if ($LASTEXITCODE -ne 0) { throw 'El seed demo fallo.' } }
    & npm.cmd run build; if ($LASTEXITCODE -ne 0) { throw 'El build demo fallo.' }

    $kubo = Get-DemoKuboPath -IpfsPath $IpfsPath
    if (-not $kubo) { throw 'Kubo no fue encontrado. Use -IpfsPath o agregue ipfs al PATH.' }
    if (Test-DemoIpfsApi) {
        $state.kubo = @{ started_by_demo = $false; pid = $null; process_name = $null }
    } else {
        & $kubo repo stat *> $null
        if ($LASTEXITCODE -ne 0) { throw 'El repositorio Kubo no esta inicializado. Inicialicelo manualmente antes de ejecutar demo:start.' }
        $kuboProcess = Start-DemoProcess -FilePath $kubo -ArgumentList @('daemon') -Name 'kubo'
        $state.kubo = @{ started_by_demo = $true; pid = $kuboProcess.Id; process_name = $kuboProcess.ProcessName }
        if (-not (Wait-DemoIpfsApi)) { throw 'Kubo no respondio por su API local.' }
        $kuboPid = Get-DemoListeningProcessId -Port 5001
        if ($kuboPid) {
            $state.kubo.pid = $kuboPid
            $state.kubo.process_name = (Get-Process -Id $kuboPid -ErrorAction SilentlyContinue).ProcessName
        }
    }

    $hardhatKey = $env:BLOCKCHAIN_PRIVATE_KEY
    if ((Get-DemoHardhatChainId) -eq 31337) {
        $state.hardhat = @{ started_by_demo = $false; pid = $null; process_name = $null }
        if (-not $hardhatKey) { throw 'Hardhat ya estaba activo. Proporcione BLOCKCHAIN_PRIVATE_KEY solo en la terminal actual para usar ese nodo preexistente.' }
    } elseif (Test-DemoPort 8545) {
        throw 'El puerto 8545 esta ocupado por un proceso que no es la red Hardhat local esperada.'
    } else {
        Initialize-DemoTempRoot
        $hardhatProcess = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d', '/s', '/c', 'npx.cmd hardhat node 1>NUL 2>NUL') -WorkingDirectory $script:DemoRepositoryRoot -WindowStyle Hidden -PassThru
        $state.hardhat = @{ started_by_demo = $true; pid = $hardhatProcess.Id; process_name = $hardhatProcess.ProcessName }
        $hardhatKey = Get-DemoHardhatLocalKey
        $deadline = (Get-Date).AddSeconds(30)
        while ((Get-Date) -lt $deadline -and (Get-DemoHardhatChainId) -ne 31337) { Start-Sleep -Milliseconds 750 }
        if ((Get-DemoHardhatChainId) -ne 31337 -or -not $hardhatKey) { throw 'Hardhat no inicio correctamente o no entrego una cuenta local de desarrollo.' }
        $hardhatPid = Get-DemoListeningProcessId -Port 8545
        if ($hardhatPid) {
            $state.hardhat.pid = $hardhatPid
            $state.hardhat.process_name = (Get-Process -Id $hardhatPid -ErrorAction SilentlyContinue).ProcessName
        }
    }

    $deployOutput = & npx.cmd hardhat run scripts/deploy-document-evidence.js --network localhost 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'El despliegue del contrato fallo.' }
    $addressMatch = [regex]::Match(($deployOutput -join "`n"), 'DOCUMENT_EVIDENCE_CONTRACT_ADDRESS=(0x[0-9a-fA-F]{40})')
    if (-not $addressMatch.Success) { throw 'No se pudo extraer la direccion del contrato desde el despliegue.' }
    $state.contract_address = $addressMatch.Groups[1].Value
    if (-not (Get-DemoContractCode -Address $state.contract_address)) { throw 'No se encontro codigo desplegado en la direccion del contrato.' }

    if (Test-DemoHttp -Uri 'http://localhost:3000/api/docs') {
        $state.backend = @{ started_by_demo = $false; pid = $null; process_name = $null }
    } elseif (Test-DemoPort 3000) {
        throw 'El puerto 3000 esta ocupado por un proceso que no es el backend demo verificable.'
    } else {
        $savedEnvironment = @{}
        foreach ($name in @('NODE_ENV','IPFS_ENABLED','IPFS_PROVIDER','IPFS_API_URL','IPFS_GATEWAY_URL','IPFS_UPLOAD_MODE','BLOCKCHAIN_ENABLED','BLOCKCHAIN_PROVIDER','BLOCKCHAIN_RPC_URL','BLOCKCHAIN_CHAIN_ID','BLOCKCHAIN_CONTRACT_ADDRESS','BLOCKCHAIN_NETWORK_NAME','BLOCKCHAIN_PRIVATE_KEY')) { $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
        try {
            $env:NODE_ENV = 'development'; $env:IPFS_ENABLED = 'true'; $env:IPFS_PROVIDER = 'kubo-local'; $env:IPFS_API_URL = 'http://127.0.0.1:5001'; $env:IPFS_GATEWAY_URL = 'http://127.0.0.1:8080/ipfs'; $env:IPFS_UPLOAD_MODE = 'manual'; $env:BLOCKCHAIN_ENABLED = 'true'; $env:BLOCKCHAIN_PROVIDER = 'hardhat-local'; $env:BLOCKCHAIN_RPC_URL = 'http://127.0.0.1:8545'; $env:BLOCKCHAIN_CHAIN_ID = '31337'; $env:BLOCKCHAIN_CONTRACT_ADDRESS = $state.contract_address; $env:BLOCKCHAIN_NETWORK_NAME = 'hardhat-local'; $env:BLOCKCHAIN_PRIVATE_KEY = $hardhatKey
            $backendProcess = Start-DemoProcess -FilePath 'npm.cmd' -ArgumentList @('start') -Name 'backend'
            $state.backend = @{ started_by_demo = $true; pid = $backendProcess.Id; process_name = $backendProcess.ProcessName }
        } finally {
            foreach ($name in $savedEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process') }
        }
        if (-not (Wait-DemoHttp -Uri 'http://localhost:3000/api/docs')) { throw 'El backend no respondio con Swagger dentro del tiempo esperado.' }
        $backendPid = Get-DemoListeningProcessId -Port 3000
        if ($backendPid) {
            $state.backend.pid = $backendPid
            $state.backend.process_name = (Get-Process -Id $backendPid -ErrorAction SilentlyContinue).ProcessName
        }
    }
    Save-DemoState -State ([pscustomobject]$state)
    Write-DemoStatus PASS 'Entorno demo iniciado. Ejecute npm.cmd run demo:check.'
    Write-DemoStatus INFO 'Estado y logs sanitizados: %TEMP%\gad-canar-demo'
} catch {
    Stop-DemoManagedProcess $state.backend -ExpectedPorts @(3000)
    Stop-DemoManagedProcess $state.hardhat -ExpectedPorts @(8545)
    Stop-DemoManagedProcess $state.kubo -ExpectedPorts @(5001, 8080)
    if (Test-Path $script:DemoStatePath) { Remove-Item $script:DemoStatePath -Force }
    throw
} finally { Pop-Location }
