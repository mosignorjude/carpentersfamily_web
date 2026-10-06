[CmdletBinding()]
param(
  [string]$LocalBackupDirectory = (Join-Path $env:USERPROFILE 'Documents\CarpentersFamilyBackups'),
  [string]$DriveBackupDirectory = 'G:\My Drive\CarpentersFamilyBackups'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:DatabasePassword = $null

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$cliPath = Join-Path $repoRoot 'node_modules\supabase\dist\supabase.js'
$dockerDirectory = Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin'
$dockerPath = Join-Path $dockerDirectory 'docker.exe'
$gpgPath = 'C:\Program Files\Git\usr\bin\gpg.exe'
$projectRefPath = Join-Path $repoRoot 'supabase\.temp\project-ref'
$storageHelperPath = Join-Path $repoRoot 'scripts\storage-backup.mjs'

foreach ($requiredPath in @($nodePath, $cliPath, $dockerPath, $gpgPath, $projectRefPath, $storageHelperPath)) {
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
    throw "Required backup tool or linked-project metadata is missing: $requiredPath"
  }
}

$env:PATH = "$dockerDirectory;$env:PATH"
$env:SUPABASE_TELEMETRY_DISABLED = '1'

function Read-SecretText {
  param([Parameter(Mandatory)][string]$Prompt)
  $secure = Read-Host -Prompt $Prompt -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $secure.Dispose()
  }
}

function Invoke-SupabaseCapture {
  param([Parameter(Mandatory)][string[]]$Arguments)
  $info = New-ProcessInfo -FileName $script:NodePath -Arguments (@($script:CliPath) + $Arguments) -RedirectOutput -RedirectError -IncludeDatabasePassword
  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $info
  $null = $process.Start()
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  $process.WaitForExit()
  $stdout = $stdoutTask.GetAwaiter().GetResult()
  $diagnostic = $stderrTask.GetAwaiter().GetResult()
  if ($process.ExitCode -ne 0) {
    if ([string]::IsNullOrWhiteSpace($diagnostic)) { $diagnostic = $stdout }
    if (-not [string]::IsNullOrEmpty($script:DatabasePassword)) {
      $diagnostic = $diagnostic.Replace($script:DatabasePassword, '[database password redacted]')
    }
    if (-not [string]::IsNullOrEmpty($script:DatabaseUrl)) {
      $diagnostic = $diagnostic.Replace($script:DatabaseUrl, '[database connection redacted]')
    }
    $diagnostic = [Regex]::Replace($diagnostic, 'postgres(ql)?://[^\s]+', '[database connection redacted]')
    $diagnostic = [Regex]::Replace($diagnostic, 'sbp_[A-Za-z0-9_-]+', '[Supabase access token redacted]')
    $lines = @($diagnostic -split '\r?\n' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    $diagnostic = ($lines | Select-Object -Last 12) -join [Environment]::NewLine
    throw "Supabase read-only preflight failed (exit $($process.ExitCode)): $($diagnostic.Trim())"
  }
  return $stdout
}

function ConvertTo-WindowsCommandLineArgument {
  param([Parameter(Mandatory)][AllowEmptyString()][string]$Argument)

  # Match Windows C-runtime argument parsing for runtimes without
  # ProcessStartInfo.ArgumentList (for example, Windows PowerShell 5.1).
  $builder = [Text.StringBuilder]::new()
  [void]$builder.Append('"')
  $backslashes = 0
  foreach ($character in $Argument.ToCharArray()) {
    if ($character -eq [char]92) {
      $backslashes++
      continue
    }
    if ($character -eq [char]34) {
      if ($backslashes -gt 0) {
        [void]$builder.Append(('\' * (2 * $backslashes)))
      }
      [void]$builder.Append('\"')
      $backslashes = 0
      continue
    }
    if ($backslashes -gt 0) {
      [void]$builder.Append(('\' * $backslashes))
      $backslashes = 0
    }
    [void]$builder.Append($character)
  }
  if ($backslashes -gt 0) {
    [void]$builder.Append(('\' * (2 * $backslashes)))
  }
  [void]$builder.Append('"')
  return $builder.ToString()
}

function New-ProcessInfo {
  param(
    [Parameter(Mandatory)][string]$FileName,
    [Parameter(Mandatory)][string[]]$Arguments,
    [switch]$RedirectInput,
    [switch]$RedirectOutput,
    [switch]$RedirectError,
    [switch]$IncludeDatabasePassword
  )
  $info = [Diagnostics.ProcessStartInfo]::new()
  $info.FileName = $FileName
  $info.WorkingDirectory = $script:RepoRoot
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.RedirectStandardInput = $RedirectInput.IsPresent
  $info.RedirectStandardOutput = $RedirectOutput.IsPresent
  $info.RedirectStandardError = $RedirectError.IsPresent
  if ($IncludeDatabasePassword.IsPresent) {
    if ([string]::IsNullOrWhiteSpace($script:DatabasePassword)) { throw 'The database password is unavailable for the Supabase CLI process.' }
    $info.EnvironmentVariables['SUPABASE_DB_PASSWORD'] = $script:DatabasePassword
  }
  if ($null -ne $info.GetType().GetProperty('ArgumentList')) {
    foreach ($argument in $Arguments) {
      $info.ArgumentList.Add($argument)
    }
  }
  else {
    $quotedArguments = foreach ($argument in $Arguments) {
      ConvertTo-WindowsCommandLineArgument -Argument $argument
    }
    $info.Arguments = $quotedArguments -join ' '
  }
  return $info
}

function Invoke-SupabaseStream {
  param(
    [Parameter(Mandatory)][string]$Stage,
    [Parameter(Mandatory)][string[]]$Arguments,
    [Parameter(Mandatory)][Diagnostics.Process]$Encryptor
  )
  $info = New-ProcessInfo -FileName $script:NodePath -Arguments (@($script:CliPath) + $Arguments) -RedirectOutput -RedirectError -IncludeDatabasePassword
  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $info
  $null = $process.Start()
  $errorTask = $process.StandardError.ReadToEndAsync()
  try {
    $process.StandardOutput.BaseStream.CopyTo($Encryptor.StandardInput.BaseStream)
  }
  catch {
    if (-not $process.HasExited) { $process.Kill($true) }
    throw "Encrypted backup stream stopped during the $Stage export."
  }
  $process.WaitForExit()
  $diagnostic = $errorTask.GetAwaiter().GetResult()
  if ($process.ExitCode -ne 0) {
    if (-not [string]::IsNullOrEmpty($script:DatabasePassword)) {
      $diagnostic = $diagnostic.Replace($script:DatabasePassword, '[database password redacted]')
    }
    if (-not [string]::IsNullOrEmpty($script:DatabaseUrl)) {
      $diagnostic = $diagnostic.Replace($script:DatabaseUrl, '[database connection redacted]')
    }
    $diagnostic = [Regex]::Replace($diagnostic, 'postgres(ql)?://[^\s]+', '[database connection redacted]')
    throw "Supabase $Stage export failed (exit $($process.ExitCode)): $($diagnostic.Trim())"
  }
}

function Get-DbQueryRow {
  param([Parameter(Mandatory)][string]$Output)
  try { $json = ConvertFrom-Json -InputObject $Output -ErrorAction Stop }
  catch { throw 'Supabase returned an unexpected JSON response for the backup query.' }
  if ($json -is [System.Array]) {
    if ($json.Count -ne 1) { throw 'Supabase backup query returned an unexpected number of rows.' }
    return $json[0]
  }
  if ($null -ne $json.PSObject.Properties['rows']) {
    $rows = @($json.rows)
    if ($rows.Count -ne 1) { throw 'Supabase backup query returned an unexpected number of rows.' }
    return $rows[0]
  }
  if ($null -ne $json.PSObject.Properties['result']) {
    $rows = @($json.result)
    if ($rows.Count -ne 1) { throw 'Supabase backup query returned an unexpected number of rows.' }
    return $rows[0]
  }
  return $json
}

function Convert-DbJsonArray {
  param([AllowNull()][object]$Value)
  if ($null -eq $Value) { return ,@() }
  if ($Value -is [string]) {
    try { $parsed = ConvertFrom-Json -InputObject $Value -ErrorAction Stop; return ,@($parsed) }
    catch { throw 'Supabase returned a malformed JSON array in the backup query.' }
  }
  return ,@($Value)
}

function Get-StorageObjectManifest {
  $query = @'
select coalesce(
  jsonb_agg(
    jsonb_build_object(
      'bucket_id', o.bucket_id,
      'name', o.name,
      'receipt_kind', case
        when c.id is not null then 'club'
        when e.id is not null then 'event'
        else null
      end,
      'receipt_id', coalesce(c.id, e.id)::text,
      'transaction_id', coalesce(c.transaction_id, e.transaction_id)::text,
      'content_type', coalesce(c.content_type, e.content_type),
      'size_bytes', coalesce(c.size_bytes, e.size_bytes),
      'sha256', coalesce(c.sha256, e.sha256),
      'status', coalesce(c.status, e.status, 'missing'),
      'storage_size_bytes', nullif(o.metadata ->> 'size', '')::bigint,
      'storage_content_type', o.metadata ->> 'mimetype',
      'cache_control', o.metadata ->> 'cacheControl'
    ) order by o.bucket_id, o.name
  ),
  '[]'::jsonb
) as storage_object_manifest
from storage.objects as o
left join public.club_financial_receipts as c on c.object_path = o.name
left join public.event_financial_receipts as e on e.object_path = o.name;
'@
  $output = Invoke-SupabaseCapture -Arguments @(
    'db', 'query', '--db-url', $script:DatabaseUrl,
    '--output-format', 'json', $query
  )
  $row = Get-DbQueryRow -Output $output
  if ($null -eq $row.PSObject.Properties['storage_object_manifest']) {
    throw 'Supabase backup query did not return Storage object metadata.'
  }
  return Convert-DbJsonArray -Value $row.storage_object_manifest
}

function Invoke-StorageArchive {
  param(
    [Parameter(Mandatory)][ValidateSet('backup', 'restore')][string]$Operation,
    [Parameter(Mandatory)][string]$FilePath,
    [Parameter(Mandatory)][hashtable]$InputObject
  )
  $arguments = @($script:StorageHelperPath, $Operation, $script:GpgPath, $FilePath)
  $info = New-ProcessInfo -FileName $script:NodePath -Arguments $arguments -RedirectInput -RedirectOutput -RedirectError
  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $info
  $null = $process.Start()
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  $payload = ConvertTo-Json -InputObject $InputObject -Depth 20 -Compress
  try {
    $process.StandardInput.Write($payload)
    $process.StandardInput.Close()
  }
  finally { $payload = $null }
  $process.WaitForExit()
  $stdout = $stdoutTask.GetAwaiter().GetResult()
  $diagnostic = $stderrTask.GetAwaiter().GetResult()
  if ($process.ExitCode -ne 0) {
    $diagnostic = [Regex]::Replace($diagnostic, 'sb_(publishable|secret)_[A-Za-z0-9_-]+', '[Supabase key redacted]')
    $diagnostic = [Regex]::Replace($diagnostic, 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[session token redacted]')
    $lines = @($diagnostic -split '\r?\n' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    throw "Storage archive operation failed: $(($lines | Select-Object -Last 4) -join ' ')."
  }
  try { return ConvertFrom-Json -InputObject $stdout -ErrorAction Stop }
  catch { throw 'The Storage archive helper returned an invalid result.' }
}
function Write-SqlMarker {
  param(
    [Parameter(Mandatory)][Diagnostics.Process]$Encryptor,
    [Parameter(Mandatory)][string]$Text
  )
  $bytes = [Text.Encoding]::UTF8.GetBytes("`n-- CFSC backup: $Text`n")
  $Encryptor.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
  $Encryptor.StandardInput.BaseStream.Flush()
}

function Test-GpgStream {
  param([Parameter(Mandatory)][string]$Path)
  $arguments = @('--no-symkey-cache', '--pinentry-mode', 'ask', '--decrypt', $Path)
  $info = New-ProcessInfo -FileName $script:GpgPath -Arguments $arguments -RedirectOutput -RedirectError
  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $info
  $null = $process.Start()
  $errorTask = $process.StandardError.ReadToEndAsync()
  $process.StandardOutput.BaseStream.CopyTo([IO.Stream]::Null)
  $process.WaitForExit()
  $diagnostic = $errorTask.GetAwaiter().GetResult()
  if ($process.ExitCode -ne 0) {
    throw "GnuPG could not verify the encrypted archive: $($diagnostic.Trim())"
  }
}

$projectRef = (Get-Content -LiteralPath $projectRefPath -Raw).Trim()
if ($projectRef -notmatch '^[a-z0-9]{20}$') { throw 'Linked Supabase project reference is invalid.' }
$refSuffix = $projectRef.Substring($projectRef.Length - 4)
Write-Host "Linked project reference ends in: $refSuffix"
$confirmedSuffix = Read-Host 'Compare the reference suffix with the Supabase project you intend to back up, then type that four-character suffix'
if ($confirmedSuffix.Trim() -ne $refSuffix) { throw 'Linked project confirmation did not match; no export was started.' }

$operatorLabel = Read-Host 'Audit label for this run (Admin, Backup Admin, or project owner)'
if ([string]::IsNullOrWhiteSpace($operatorLabel)) { throw 'An operator label is required for the backup manifest.' }

try {
$script:DatabasePassword = Read-SecretText 'Supabase database password'
if ([string]::IsNullOrWhiteSpace($script:DatabasePassword)) { throw 'The Supabase database password is required.' }
$script:DatabaseUrl = "postgresql://postgres.$($projectRef)@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"

$cliVersion = (& $nodePath $cliPath --version).Trim()
if ($LASTEXITCODE -ne 0 -or $cliVersion -ne '2.119.0') {
  throw "Expected the repository-pinned Supabase CLI 2.119.0; found '$cliVersion'."
}
$dockerVersion = (& $dockerPath info --format '{{.ServerVersion}}' 2>$null).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($dockerVersion)) {
  throw 'Docker Desktop engine is unavailable; no export was started.'
}
$gpgVersion = ((& $gpgPath --version | Select-Object -First 1).Trim())

$countQuery = @'
select
  (select count(*) from auth.users) as auth_users,
  (select count(*) from storage.buckets) as storage_buckets,
  (select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'public', public,
    'file_size_limit', file_size_limit,
    'allowed_mime_types', allowed_mime_types
  ) order by id), '[]'::jsonb) from storage.buckets) as storage_bucket_manifest,
  (select count(*) from storage.objects) as storage_objects,
  (select coalesce(sum((metadata ->> 'size')::bigint), 0) from storage.objects) as storage_object_bytes,
  pg_database_size(current_database()) as database_bytes;
'@
$countOutput = Invoke-SupabaseCapture -Arguments @('db', 'query', '--db-url', $script:DatabaseUrl, '--output-format', 'json', $countQuery)
$counts = Get-DbQueryRow -Output $countOutput
foreach ($field in @('auth_users', 'storage_buckets', 'storage_bucket_manifest', 'storage_objects', 'storage_object_bytes', 'database_bytes')) {
  if ($null -eq $counts.PSObject.Properties[$field]) {
    throw 'Supabase aggregate backup-count result was missing a required field. No archive was created.'
  }
}
$authUsers = [int64]$counts.auth_users
$storageBuckets = [int64]$counts.storage_buckets
$storageObjects = [int64]$counts.storage_objects
$storageObjectBytes = [int64]$counts.storage_object_bytes
if ($storageObjects -gt 10000 -or $storageObjectBytes -gt 1073741824) { throw 'Storage objects exceed the reviewed backup limits. No archive was created.' }
$databaseBytes = [int64]$counts.database_bytes
$bucketRows = Convert-DbJsonArray -Value $counts.storage_bucket_manifest
if ($bucketRows.Count -ne $storageBuckets) {
  throw 'Supabase bucket count did not match its bucket manifest. No archive was created.'
}
if ($bucketRows.Count -ne 1) {
  throw 'The reviewed private receipt bucket is missing. No archive was created.'
}
if ($bucketRows.Count -gt 1) {
  throw 'This runner only backs up the application receipt bucket. A new Storage bucket requires its own reviewed backup policy.'
}
if ($bucketRows.Count -eq 1) {
  $bucket = $bucketRows[0]
  $allowedTypes = Convert-DbJsonArray -Value $bucket.allowed_mime_types
  $actualTypes = (@($allowedTypes | Sort-Object) -join ',')
  if (
    $bucket.id -ne 'club-finance-receipts' -or
    [bool]$bucket.public -or
    [int64]$bucket.file_size_limit -ne 4194304 -or
    $actualTypes -ne 'application/pdf,image/jpeg,image/png'
  ) {
    throw 'The receipt bucket configuration differs from the reviewed private 4 MiB allowlist. No archive was created.'
  }
}
if ($storageObjects -gt 0 -and $bucketRows.Count -ne 1) {
  throw 'Storage objects exist without the reviewed receipt bucket configuration. No archive was created.'
}

$objectManifest = @()
if ($storageObjects -gt 0) {
  $objectManifest = Get-StorageObjectManifest
  if ($objectManifest.Count -ne $storageObjects) {
    throw 'Storage object rows did not match the metadata manifest. No archive was created.'
  }
}

$upstream = (& git -C $repoRoot rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>$null).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($upstream)) {
  throw 'The source branch has no GitHub upstream; publish the reviewed source commit before creating a backup.'
}
$unpublishedCommits = (& git -C $repoRoot rev-list --count "$upstream..HEAD").Trim()
if ($LASTEXITCODE -ne 0 -or $unpublishedCommits -ne '0') {
  throw 'The source commit is not available on its GitHub upstream. Push the reviewed commit before creating a backup.'
}
$migrationChanges = @(& git -C $repoRoot status --porcelain -- supabase/migrations supabase/config.toml)
if ($LASTEXITCODE -ne 0 -or $migrationChanges.Count -gt 0) {
  throw 'Commit or clean pending Supabase migration/config changes before making a recoverable database snapshot.'
}
$sourceCommit = (& git -C $repoRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Could not record the source commit for the backup manifest.' }

New-Item -ItemType Directory -Force -Path $LocalBackupDirectory, $DriveBackupDirectory | Out-Null
$timestamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
$baseName = "CarpentersFamily-$timestamp"
$partialPath = Join-Path $LocalBackupDirectory "$baseName.sql.gpg.partial"
$archivePath = Join-Path $LocalBackupDirectory "$baseName.sql.gpg"
$drivePartialPath = Join-Path $DriveBackupDirectory "$baseName.sql.gpg.partial"
$driveArchivePath = Join-Path $DriveBackupDirectory "$baseName.sql.gpg"
$storagePartialPath = Join-Path $LocalBackupDirectory "$baseName.storage.tar.gpg.partial"
$storageArchivePath = Join-Path $LocalBackupDirectory "$baseName.storage.tar.gpg"
$driveStoragePartialPath = Join-Path $DriveBackupDirectory "$baseName.storage.tar.gpg.partial"
$driveStorageArchivePath = Join-Path $DriveBackupDirectory "$baseName.storage.tar.gpg"
$manifestPath = Join-Path $LocalBackupDirectory "$baseName.manifest.json"
$manifestPartialPath = Join-Path $LocalBackupDirectory "$baseName.manifest.json.partial"
$driveManifestPath = Join-Path $DriveBackupDirectory "$baseName.manifest.json"
$driveManifestPartialPath = Join-Path $DriveBackupDirectory "$baseName.manifest.json.partial"
$existingBackupPaths = @(
  $partialPath, $archivePath, $drivePartialPath, $driveArchivePath,
  $storagePartialPath, $storageArchivePath, $driveStoragePartialPath, $driveStorageArchivePath,
  $manifestPath, $manifestPartialPath, $driveManifestPath, $driveManifestPartialPath
) | Where-Object { Test-Path -LiteralPath $_ }
if ($existingBackupPaths.Count -gt 0) {
  throw 'A backup with this timestamp already exists; no existing files will be overwritten.'
}

$gpgArguments = @(
  '--no-symkey-cache', '--pinentry-mode', 'ask', '--force-mdc',
  '--s2k-mode', '3', '--s2k-digest-algo', 'SHA256', '--s2k-count', '65011712',
  '--symmetric', '--cipher-algo', 'AES256', '--compress-algo', 'ZIP',
  '--output', $partialPath
)
$gpgInfo = New-ProcessInfo -FileName $gpgPath -Arguments $gpgArguments -RedirectInput
$encryptor = [Diagnostics.Process]::new()
$encryptor.StartInfo = $gpgInfo
$completed = $false
$encryptorStarted = $false

try {
  $null = $encryptor.Start()
  $encryptorStarted = $true
  Write-SqlMarker -Encryptor $encryptor -Text 'roles'
  Invoke-SupabaseStream -Stage 'role' -Arguments @('db', 'dump', '--db-url', $script:DatabaseUrl, '--role-only') -Encryptor $encryptor

  Write-SqlMarker -Encryptor $encryptor -Text 'application schema'
  Invoke-SupabaseStream -Stage 'schema' -Arguments @('db', 'dump', '--db-url', $script:DatabaseUrl) -Encryptor $encryptor

  Write-SqlMarker -Encryptor $encryptor -Text 'data begins; triggers disabled for restore'
  $triggerOff = [Text.Encoding]::UTF8.GetBytes("SET session_replication_role = replica;`n")
  $encryptor.StandardInput.BaseStream.Write($triggerOff, 0, $triggerOff.Length)
  $encryptor.StandardInput.BaseStream.Flush()
  Invoke-SupabaseStream -Stage 'data' -Arguments @('db', 'dump', '--db-url', $script:DatabaseUrl, '--data-only', '--use-copy') -Encryptor $encryptor
  $triggerOn = [Text.Encoding]::UTF8.GetBytes("`nRESET session_replication_role;`n")
  $encryptor.StandardInput.BaseStream.Write($triggerOn, 0, $triggerOn.Length)
  $encryptor.StandardInput.BaseStream.Flush()

  $encryptor.StandardInput.Close()
  $encryptor.WaitForExit()
  if ($encryptor.ExitCode -ne 0) { throw "GnuPG encryption failed with exit code $($encryptor.ExitCode)." }
  if (-not (Test-Path -LiteralPath $partialPath -PathType Leaf) -or (Get-Item $partialPath).Length -lt 128) {
    throw 'The encrypted output is missing or unexpectedly small.'
  }

  Test-GpgStream -Path $partialPath
  Move-Item -LiteralPath $partialPath -Destination $archivePath

  $storageInput = @{
    projectRef = $projectRef
    supabaseUrl = "https://$projectRef.supabase.co"
    objects = $objectManifest
  }
  $storageRole = 'not required; no receipt objects'
  if ($storageObjects -gt 0) {
    $publishableKey = Read-Host 'Supabase publishable/anon key for this project'
    $operatorEmail = Read-Host 'Email for an active Admin or Backup Admin account'
    $storagePassword = Read-SecretText 'Password for that active Admin or Backup Admin account'
    if ([string]::IsNullOrWhiteSpace($publishableKey) -or [string]::IsNullOrWhiteSpace($operatorEmail) -or [string]::IsNullOrWhiteSpace($storagePassword)) {
      throw 'Storage backup requires the active Admin or Backup Admin session.'
    }
    $storageInput.publishableKey = $publishableKey.Trim()
    $storageInput.email = $operatorEmail.Trim()
    $storageInput.password = $storagePassword
  }
  try {
    $storageResult = Invoke-StorageArchive -Operation 'backup' -FilePath $storagePartialPath -InputObject $storageInput
  }
  finally {
    $storageInput.password = $null
    $storagePassword = $null
    $publishableKey = $null
    $operatorEmail = $null
  }
  if ([int64]$storageResult.objectCount -ne $storageObjects -or [int64]$storageResult.totalBytes -ne $storageObjectBytes) {
    throw 'The encrypted Storage archive count or byte total did not match the database preflight.'
  }
  $storageRole = [string]$storageResult.storageReadRole
  if (-not (Test-Path -LiteralPath $storagePartialPath -PathType Leaf) -or (Get-Item $storagePartialPath).Length -lt 128) {
    throw 'The encrypted Storage archive is missing or unexpectedly small.'
  }
  Test-GpgStream -Path $storagePartialPath
  Move-Item -LiteralPath $storagePartialPath -Destination $storageArchivePath

  $postCountOutput = Invoke-SupabaseCapture -Arguments @(
    'db', 'query', '--db-url', $script:DatabaseUrl,
    '--output-format', 'json', $countQuery
  )
  $postCounts = Get-DbQueryRow -Output $postCountOutput
  $postBuckets = Convert-DbJsonArray -Value $postCounts.storage_bucket_manifest
  if (
    [int64]$postCounts.storage_objects -ne $storageObjects -or
    [int64]$postCounts.storage_object_bytes -ne $storageObjectBytes -or
    [int64]$postCounts.storage_buckets -ne $storageBuckets -or
    [int64]$postCounts.auth_users -ne $authUsers -or
    (ConvertTo-Json -InputObject $postBuckets -Depth 10 -Compress) -ne
      (ConvertTo-Json -InputObject $bucketRows -Depth 10 -Compress)
  ) {
    throw 'Storage objects or bucket configuration changed during the backup. This pair was not marked complete.'
  }
  $postObjectManifest = @()
  if ($storageBuckets -eq 1) { $postObjectManifest = Get-StorageObjectManifest }
  if (
    $postObjectManifest.Count -ne $objectManifest.Count -or
    (ConvertTo-Json -InputObject $postObjectManifest -Depth 20 -Compress) -ne
      (ConvertTo-Json -InputObject $objectManifest -Depth 20 -Compress)
  ) {
    throw 'Receipt metadata changed during the Storage export. This pair was not marked complete.'
  }

  Copy-Item -LiteralPath $archivePath -Destination $drivePartialPath
  Copy-Item -LiteralPath $storageArchivePath -Destination $driveStoragePartialPath
  $databaseLocalHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash
  $databaseDrivePartialHash = (Get-FileHash -LiteralPath $drivePartialPath -Algorithm SHA256).Hash
  $storageLocalHash = (Get-FileHash -LiteralPath $storageArchivePath -Algorithm SHA256).Hash
  $storageDrivePartialHash = (Get-FileHash -LiteralPath $driveStoragePartialPath -Algorithm SHA256).Hash
  if ($databaseLocalHash -ne $databaseDrivePartialHash -or $storageLocalHash -ne $storageDrivePartialHash) {
    throw 'A local and Google Drive encrypted backup hash did not match.'
  }
  Move-Item -LiteralPath $drivePartialPath -Destination $driveArchivePath
  Move-Item -LiteralPath $driveStoragePartialPath -Destination $driveStorageArchivePath
  $databaseDriveHash = (Get-FileHash -LiteralPath $driveArchivePath -Algorithm SHA256).Hash
  $storageDriveHash = (Get-FileHash -LiteralPath $driveStorageArchivePath -Algorithm SHA256).Hash
  if ($databaseLocalHash -ne $databaseDriveHash -or $storageLocalHash -ne $storageDriveHash) {
    throw 'Final local and Google Drive encrypted backup hashes did not match.'
  }

  $manifest = [ordered]@{
    action = 'hosted database and Storage backup'
    actor = $operatorLabel.Trim()
    createdAtUtc = [DateTime]::UtcNow.ToString('o')
    projectRef = $projectRef
    sourceCommit = $sourceCommit
    supabaseCli = $cliVersion
    dockerEngine = $dockerVersion
    gpg = $gpgVersion
    databaseBytes = $databaseBytes
    authUserCount = $authUsers
    storageBucketCount = $storageBuckets
    storageObjectCount = [int64]$storageResult.objectCount
    storageObjectBytes = [int64]$storageResult.totalBytes
    storageReadRole = $storageRole
    backupScope = 'database schemas/data including Auth and Storage metadata, plus every verified receipt object in the reviewed private bucket'
    connection = 'Supavisor Session pooler for database; short-lived authenticated Admin/Backup Admin session with Storage RLS; no service-role key used'
    encryption = 'Separate database SQL and Storage tar archives; GnuPG OpenPGP symmetric AES-256 with integrity protection and interactive passphrase prompts'
    databaseFile = [IO.Path]::GetFileName($archivePath)
    databaseSha256 = $databaseLocalHash
    storageFile = [IO.Path]::GetFileName($storageArchivePath)
    storageSha256 = $storageLocalHash
    localDatabaseCopyVerified = $true
    driveDatabaseCopyVerified = $true
    localStorageCopyVerified = $true
    driveStorageCopyVerified = $true
  }
  $manifestText = ConvertTo-Json -InputObject $manifest -Depth 5
  [IO.File]::WriteAllText($manifestPartialPath, $manifestText, [Text.UTF8Encoding]::new($false))
  Copy-Item -LiteralPath $manifestPartialPath -Destination $driveManifestPartialPath
  $localManifestHash = (Get-FileHash -LiteralPath $manifestPartialPath -Algorithm SHA256).Hash
  $driveManifestHash = (Get-FileHash -LiteralPath $driveManifestPartialPath -Algorithm SHA256).Hash
  if ($localManifestHash -ne $driveManifestHash) { throw 'The local and Drive manifests do not match.' }
  Move-Item -LiteralPath $manifestPartialPath -Destination $manifestPath
  Move-Item -LiteralPath $driveManifestPartialPath -Destination $driveManifestPath
  $completed = $true

  Write-Host "Encrypted database and Storage archives created and verified in both destinations: $baseName"
  Write-Host "Both encrypted archive hashes and manifest copies match. The manifest records the source commit and object totals."
}
finally {
  if ($encryptorStarted -and -not $encryptor.HasExited) {
    try { $encryptor.Kill($true) } catch {}
  }
  foreach ($temporaryPath in @($partialPath, $storagePartialPath, $drivePartialPath, $driveStoragePartialPath, $manifestPartialPath, $driveManifestPartialPath)) {
    if (Test-Path -LiteralPath $temporaryPath) {
      Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue
    }
  }
  if (-not $completed) {
    Write-Warning 'This run did not complete. The previous verified backups were preserved.'
  }
}
}
finally {
  $script:DatabasePassword = $null
  $script:DatabaseUrl = $null
}
