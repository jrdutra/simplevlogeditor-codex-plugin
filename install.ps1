[CmdletBinding(SupportsShouldProcess = $true)]
param([string]$CodexPath)

$ErrorActionPreference = 'Stop'
$repositoryRoot = $PSScriptRoot
$marketplace = Get-Content -LiteralPath (Join-Path $repositoryRoot '.agents/plugins/marketplace.json') -Raw | ConvertFrom-Json
$plugin = $marketplace.plugins | Where-Object { $_.name -eq 'simple-vlog-editor' } | Select-Object -First 1
if (-not $plugin -or $marketplace.name -notmatch '^[A-Za-z0-9_-]+$') {
    throw 'Marketplace invalido: Simple Vlog Editor nao encontrado.'
}
$selector = "$($plugin.name)@$($marketplace.name)"

if (-not $CodexPath) {
    $command = Get-Command codex.exe -ErrorAction SilentlyContinue
    if ($command) { $CodexPath = $command.Source }
}
if (-not $CodexPath -and $env:LOCALAPPDATA) {
    $bundled = Join-Path $env:LOCALAPPDATA 'OpenAI/Codex/bin'
    if (Test-Path -LiteralPath $bundled) {
        $candidate = Get-ChildItem -LiteralPath $bundled -Directory |
            ForEach-Object { Get-Item -LiteralPath (Join-Path $_.FullName 'codex.exe') -ErrorAction SilentlyContinue } |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($candidate) { $CodexPath = $candidate.FullName }
    }
}
if (-not $CodexPath -or -not (Test-Path -LiteralPath $CodexPath -PathType Leaf)) {
    throw 'Codex CLI nao encontrado. Instale o Codex ou informe -CodexPath com o caminho de codex.exe.'
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Instale Node.js 18 ou superior e reinicie o Codex para atualizar o PATH.'
}

# Adding the catalog alone does not install a plugin. Always perform both steps,
# deriving the selector from this repository instead of the legacy @personal.
if ($PSCmdlet.ShouldProcess($selector, 'Registrar marketplace e instalar/atualizar apenas este plugin no Codex')) {
    & $CodexPath plugin marketplace add $repositoryRoot
    if ($LASTEXITCODE -ne 0) { throw 'O Codex nao conseguiu registrar o marketplace.' }
    & $CodexPath plugin add $selector
    if ($LASTEXITCODE -ne 0) { throw 'O marketplace foi registrado, mas o plugin nao foi instalado.' }
    $listing = & $CodexPath plugin list --json
    if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel confirmar a instalacao.' }
    $installed = ($listing | ConvertFrom-Json).installed | Where-Object { $_.pluginId -eq $selector -and $_.enabled }
    if (-not $installed) { throw "O Codex ainda nao lista $selector como instalado e habilitado." }
    Write-Host "Instalado e habilitado: $selector"
    Write-Host 'Abra uma nova tarefa, selecione Simple Vlog Editor e peca para abrir o editor instalado.'
}
