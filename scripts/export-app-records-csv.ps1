[CmdletBinding()]
param(
  [string]$LocalBackupDirectory = (Join-Path $env:USERPROFILE 'Documents\CarpentersFamilyBackups'),
  [string]$DriveBackupDirectory = 'G:\My Drive\CarpentersFamilyBackups'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:DatabasePassword = $null
$script:SecretPointer = [IntPtr]::Zero
$localPartialPath = $null
$drivePartialPath = $null
$localArchivePath = $null
$driveArchivePath = $null

$driveArchiveCreated = $false
$completed = $false

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$helperPath = Join-Path $PSScriptRoot 'app-records-csv.mjs'
$dockerPath = Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe'
$gpgPath = 'C:\Program Files\Git\usr\bin\gpg.exe'
$projectRefPath = Join-Path $repoRoot 'supabase\.temp\project-ref'
$psqlImage = 'public.ecr.aws/supabase/postgres:17.11.0.002'

foreach ($requiredPath in @($nodePath, $helperPath, $dockerPath, $gpgPath, $projectRefPath)) {
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
    throw "Required local tool or linked-project metadata is missing: $requiredPath"
  }
}

$projectRef = (Get-Content -LiteralPath $projectRefPath -Raw).Trim()
if ($projectRef -notmatch '^[a-z0-9]{20}$') {
  throw 'The linked Supabase project reference is invalid. No export was started.'
}

$driveRoot = [System.IO.Path]::GetPathRoot([System.IO.Path]::GetFullPath($DriveBackupDirectory))
if (-not (Test-Path -LiteralPath $driveRoot -PathType Container)) {
  throw "Google Drive is not mounted at $driveRoot. Open Google Drive for desktop and confirm My Drive is available. No export was started."
}
$driveParent = Split-Path -Parent $DriveBackupDirectory
if (-not (Test-Path -LiteralPath $driveParent -PathType Container)) {
  throw "The Google Drive folder is unavailable: $driveParent. Confirm Google Drive for desktop is running and My Drive is mounted. No export was started."
}

New-Item -ItemType Directory -Force -Path $LocalBackupDirectory, $DriveBackupDirectory | Out-Null
$LocalBackupDirectory = (Resolve-Path -LiteralPath $LocalBackupDirectory).Path
$DriveBackupDirectory = (Resolve-Path -LiteralPath $DriveBackupDirectory).Path

function Test-DirectoryWritable {
  param([Parameter(Mandatory)][string]$Directory)
  $probePath = Join-Path $Directory ('.carpenters-write-check-' + [Guid]::NewGuid().ToString('N') + '.tmp')
  $probe = $null
  try {
    $probe = [System.IO.File]::Open(
      $probePath,
      [System.IO.FileMode]::CreateNew,
      [System.IO.FileAccess]::Write,
      [System.IO.FileShare]::None
    )
  }
  catch {
    throw "The backup destination is not writable: $Directory. No database export was started."
  }
  finally {
    if ($null -ne $probe) { $probe.Dispose() }
  }
  Remove-Item -LiteralPath $probePath -Force -ErrorAction Stop
}

Test-DirectoryWritable -Directory $LocalBackupDirectory
Test-DirectoryWritable -Directory $DriveBackupDirectory

$dockerServer = & $dockerPath info --format '{{.ServerVersion}}'
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace(($dockerServer | Out-String).Trim())) {
  throw 'Docker Desktop is not ready. Start Docker Desktop and wait until it reports that the engine is running. No export was started.'
}
$imageId = & $dockerPath image inspect $psqlImage --format '{{.Id}}' 2>$null
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace(($imageId | Out-String).Trim())) {
  throw "The pinned PostgreSQL image is not cached. Run 'docker pull $psqlImage' once, then retry. No export was started."
}

$timestamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
$baseName = "CarpentersFamily-AppRecords-$timestamp.csv.gpg"
$localArchivePath = Join-Path $LocalBackupDirectory $baseName
$localPartialPath = $localArchivePath + '.partial'
$driveArchivePath = Join-Path $DriveBackupDirectory $baseName
$drivePartialPath = $driveArchivePath + '.partial'
$allOutputPaths = @($localArchivePath, $localPartialPath, $driveArchivePath, $drivePartialPath)
if (@($allOutputPaths | Where-Object { Test-Path -LiteralPath $_ }).Count -gt 0) {
  throw 'An export with this timestamp already exists; no existing files will be overwritten.'
}

Write-Host ''
Write-Host 'This export is an encrypted archival records extract, not a restorable database backup.'
Write-Host 'It contains app-owned public and private table rows, including private dues and poll records.'
Write-Host 'Supabase Auth credentials, schema and policies, project settings, secrets, and receipt file contents are excluded.'
Write-Host 'Receipt metadata remains in the app tables. The encrypted file is sensitive; keep its GPG passphrase private.'
Write-Host 'The export uses one read-only PostgreSQL statement snapshot and writes no plaintext CSV to disk.'
Write-Host ''
$confirmation = Read-Host 'Type EXPORT to continue'
if ($confirmation -cne 'EXPORT') {
  Write-Host 'Export cancelled. No database query was started.'
  return
}

$securePassword = Read-Host 'Supabase database password (input hidden)' -AsSecureString
if ($securePassword.Length -lt 1) {
  $securePassword.Dispose()
  throw 'The database password cannot be empty. No export was started.'
}
try {
  $script:SecretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  $script:DatabasePassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($script:SecretPointer)
}
finally {
  if ($script:SecretPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($script:SecretPointer) }
  $script:SecretPointer = [IntPtr]::Zero
  $securePassword.Dispose()
}

try {
  $env:CARPENTERS_APP_CSV_DB_PASSWORD = $script:DatabasePassword
  & $nodePath $helperPath export $dockerPath $gpgPath $projectRef $localPartialPath
  if ($LASTEXITCODE -ne 0) {
    throw "The encrypted CSV export failed (exit $LASTEXITCODE). No completed export was created."
  }

  if (-not (Test-Path -LiteralPath $localPartialPath -PathType Leaf)) {
    throw 'The encrypted local output is missing. The export is incomplete.'
  }
  Move-Item -LiteralPath $localPartialPath -Destination $localArchivePath -ErrorAction Stop


  Copy-Item -LiteralPath $localArchivePath -Destination $drivePartialPath -ErrorAction Stop
  $localHash = (Get-FileHash -LiteralPath $localArchivePath -Algorithm SHA256).Hash
  $drivePartialHash = (Get-FileHash -LiteralPath $drivePartialPath -Algorithm SHA256).Hash
  if ($localHash -cne $drivePartialHash) {
    throw 'The encrypted Google Drive copy does not match the local copy. The export is incomplete; the verified local encrypted file was preserved.'
  }

  Move-Item -LiteralPath $drivePartialPath -Destination $driveArchivePath -ErrorAction Stop
  $driveArchiveCreated = $true
  $driveHash = (Get-FileHash -LiteralPath $driveArchivePath -Algorithm SHA256).Hash
  if ($localHash -cne $driveHash) {
    throw 'The final Google Drive copy failed SHA-256 verification. The verified local encrypted file was preserved.'
  }

  $completed = $true
  Write-Host ''
  Write-Host 'CSV export complete.'
  Write-Host "Local encrypted file: $localArchivePath"
  Write-Host "Google Drive encrypted file: $driveArchivePath"
  Write-Host "SHA-256: $localHash"
  Write-Host 'Both ciphertext copies match, and GnuPG decryption verification passed.'
  Write-Host 'This extract is not a restorable database backup.'
}
catch {
  Write-Warning 'The export did not complete. Any verified local encrypted file is preserved.'
  throw
}
finally {
  Remove-Item Env:\CARPENTERS_APP_CSV_DB_PASSWORD -ErrorAction SilentlyContinue
  $script:DatabasePassword = $null
  if ($localPartialPath -and (Test-Path -LiteralPath $localPartialPath)) {
    Remove-Item -LiteralPath $localPartialPath -Force -ErrorAction SilentlyContinue
  }
  if ($drivePartialPath -and (Test-Path -LiteralPath $drivePartialPath)) {
    Remove-Item -LiteralPath $drivePartialPath -Force -ErrorAction SilentlyContinue
  }
  if (-not $completed -and $driveArchiveCreated -and $driveArchivePath -and (Test-Path -LiteralPath $driveArchivePath)) {
    Remove-Item -LiteralPath $driveArchivePath -Force -ErrorAction SilentlyContinue
  }
}
