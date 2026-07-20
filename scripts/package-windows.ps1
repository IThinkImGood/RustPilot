param(
  [string]$Version = ""
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$packageJson = Get-Content -LiteralPath (Join-Path $root "package.json") | ConvertFrom-Json
$version = if ($Version) { $Version.TrimStart("v") } else { $packageJson.version }
$releaseRoot = Join-Path $root "release"
$bundleName = "RustPilot-v$version-win-x64"
$bundleDir = Join-Path $releaseRoot $bundleName
$appDir = Join-Path $bundleDir "app"
$runtimeDir = Join-Path $bundleDir "runtime"
$launcherBuildDir = Join-Path $releaseRoot "_launcher-build"
$zipPath = Join-Path $releaseRoot "$bundleName.zip"

function Invoke-Native($File, [string[]]$Arguments) {
  & $File @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$File exited with code $LASTEXITCODE"
  }
}

function Copy-Directory($Source, $Destination) {
  if (!(Test-Path -LiteralPath $Source)) {
    throw "Missing required path: $Source"
  }
  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  Copy-Item -Path (Join-Path $Source "*") -Destination $Destination -Recurse -Force
}

function Write-Json($Path, $Value) {
  $Value | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $Path -Encoding UTF8
}

Write-Host "Building RustPilot production output..."
Push-Location $root
try {
  Invoke-Native "npm" @("run", "build")
} finally {
  Pop-Location
}

if (Test-Path -LiteralPath $bundleDir) {
  Remove-Item -LiteralPath $bundleDir -Recurse -Force
}
if (Test-Path -LiteralPath $launcherBuildDir) {
  Remove-Item -LiteralPath $launcherBuildDir -Recurse -Force
}
if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

New-Item -ItemType Directory -Force -Path $appDir, $runtimeDir, $releaseRoot | Out-Null

Write-Host "Copying app build..."
Copy-Directory (Join-Path $root "apps\server\dist") (Join-Path $appDir "apps\server\dist")
Copy-Directory (Join-Path $root "apps\web\out") (Join-Path $appDir "apps\web\out")

$sharedPackage = Get-Content -LiteralPath (Join-Path $root "packages\shared\package.json") | ConvertFrom-Json
$adapterPackage = Get-Content -LiteralPath (Join-Path $root "packages\rust-adapter\package.json") | ConvertFrom-Json
$serverPackage = Get-Content -LiteralPath (Join-Path $root "apps\server\package.json") | ConvertFrom-Json

$runtimePackage = [ordered]@{
  name = "rustpilot-runtime"
  version = $version
  private = $true
  type = "module"
  dependencies = [ordered]@{}
}
foreach ($dependency in $serverPackage.dependencies.PSObject.Properties) {
  if ($dependency.Name -notlike "@rustpilot/*") {
    $runtimePackage.dependencies[$dependency.Name] = $dependency.Value
  }
}
Write-Json (Join-Path $appDir "package.json") $runtimePackage

Write-Host "Installing production dependencies..."
Push-Location $appDir
try {
  Invoke-Native "npm" @("install", "--omit=dev", "--package-lock=false", "--no-audit", "--no-fund")
} finally {
  Pop-Location
}

Write-Host "Copying local RustPilot workspace packages..."
Copy-Directory (Join-Path $root "packages\shared\dist") (Join-Path $appDir "node_modules\@rustpilot\shared\dist")
Copy-Directory (Join-Path $root "packages\rust-adapter\dist") (Join-Path $appDir "node_modules\@rustpilot\rust-adapter\dist")
Write-Json (Join-Path $appDir "node_modules\@rustpilot\shared\package.json") $sharedPackage
Write-Json (Join-Path $appDir "node_modules\@rustpilot\rust-adapter\package.json") $adapterPackage

$nodeExe = (Get-Command node.exe).Source
$bundledNode = Join-Path $runtimeDir "node.exe"
Copy-Item -LiteralPath $nodeExe -Destination $bundledNode -Force

Write-Host "Building RustPilot.exe launcher with Node SEA..."
New-Item -ItemType Directory -Force -Path $launcherBuildDir | Out-Null
@'
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function quote(value) {
  return `"${value.replace(/"/g, '\\"')}"`;
}

const baseDir = path.dirname(process.execPath);
const nodePath = path.join(baseDir, "runtime", "node.exe");
const entryPath = path.join(baseDir, "app", "apps", "server", "dist", "index.js");

if (!fs.existsSync(nodePath)) {
  console.error(`Missing bundled Node runtime: ${nodePath}`);
  process.exit(1);
}

if (!fs.existsSync(entryPath)) {
  console.error(`Missing RustPilot server entrypoint: ${entryPath}`);
  process.exit(1);
}

process.chdir(baseDir);

const env = { ...process.env, NODE_ENV: "production" };
if (!env.RUSTPILOT_DATA_DIR) {
  env.RUSTPILOT_DATA_DIR = path.join(baseDir, "data");
}

console.log("Starting RustPilot...");
console.log(`Panel: http://${env.RUSTPILOT_HOST || "127.0.0.1"}:${env.RUSTPILOT_PORT || "40815"}`);
console.log("");

const child = spawn(nodePath, [entryPath, ...process.argv.slice(2)], {
  cwd: baseDir,
  env,
  stdio: "inherit",
  windowsHide: false
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`RustPilot stopped by signal ${signal}.`);
    process.exit(1);
  }
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
'@ | Set-Content -LiteralPath (Join-Path $launcherBuildDir "launcher.cjs") -Encoding UTF8

$seaConfigPath = Join-Path $launcherBuildDir "sea-config.json"
$seaBlobPath = Join-Path $launcherBuildDir "sea-prep.blob"
@{
  main = Join-Path $launcherBuildDir "launcher.cjs"
  output = $seaBlobPath
  disableExperimentalSEAWarning = $true
} | ConvertTo-Json | Set-Content -LiteralPath $seaConfigPath -Encoding UTF8

Invoke-Native "node" @("--experimental-sea-config", $seaConfigPath)

$launcherExe = Join-Path $bundleDir "RustPilot.exe"
Copy-Item -LiteralPath $nodeExe -Destination $launcherExe -Force
Invoke-Native "npx" @("postject", $launcherExe, "NODE_SEA_BLOB", $seaBlobPath, "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2", "--overwrite")

@"
RustPilot $version Windows x64

Start:
  Double-click RustPilot.exe.

What it does:
  - Starts the local RustPilot backend on http://127.0.0.1:40815
  - Serves the production web panel from this folder
  - Opens the setup wizard or dashboard in your browser

Data:
  Runtime data is stored in the data folder next to RustPilot.exe unless RUSTPILOT_DATA_DIR is set.

Notes:
  Do not move files out of this folder. Keep runtime, app, and RustPilot.exe together.
"@ | Set-Content -LiteralPath (Join-Path $bundleDir "README.txt") -Encoding UTF8

Write-Host "Creating ZIP..."
Compress-Archive -Path (Join-Path $bundleDir "*") -DestinationPath $zipPath -Force
if (!(Test-Path -LiteralPath $zipPath)) {
  throw "ZIP was not created: $zipPath"
}

Write-Host "Created:"
Write-Host "  $bundleDir"
Write-Host "  $zipPath"
