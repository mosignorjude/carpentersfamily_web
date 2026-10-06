[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateNotNullOrEmpty()]
  [string]$ArchivePath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$helperPath = Join-Path $repoRoot 'scripts\storage-backup.mjs'
$gpgPath = 'C:\Program Files\Git\usr\bin\gpg.exe'

foreach ($requiredPath in @($nodePath, $helperPath, $gpgPath)) {
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
    throw "Required restore tool is missing: $requiredPath"
  }
}
$resolvedArchive = (Resolve-Path -LiteralPath $ArchivePath -ErrorAction Stop).Path
if (-not (Test-Path -LiteralPath $resolvedArchive -PathType Leaf)) {
  throw 'The encrypted Storage archive file is missing.'
}

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

function ConvertTo-WindowsCommandLineArgument {
  param([Parameter(Mandatory)][AllowEmptyString()][string]$Argument)
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
    [switch]$RedirectError
  )
  $info = [Diagnostics.ProcessStartInfo]::new()
  $info.FileName = $FileName
  $info.WorkingDirectory = $script:RepoRoot
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.RedirectStandardInput = $RedirectInput.IsPresent
  $info.RedirectStandardOutput = $RedirectOutput.IsPresent
  $info.RedirectStandardError = $RedirectError.IsPresent
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

$confirmation = Read-Host 'This restores receipt files only to local Supabase at http://127.0.0.1:54321. Restore the matching database first. Type RESTORE TO LOCAL to continue'
if ($confirmation -cne 'RESTORE TO LOCAL') {
  throw 'Restore cancelled. No Storage files were changed.'
}

$localKey = Read-SecretText 'Local Supabase service_role key (from local supabase status; never use a hosted key)'
if ([string]::IsNullOrWhiteSpace($localKey)) {
  throw 'A local Supabase service key is required.'
}

$keyForRedaction = $localKey
$inputObject = @{
  supabaseUrl = 'http://127.0.0.1:54321'
  localServiceRoleKey = $localKey
}
$arguments = @($helperPath, 'restore', $gpgPath, $resolvedArchive)
$info = New-ProcessInfo -FileName $nodePath -Arguments $arguments -RedirectInput -RedirectOutput -RedirectError
$process = [Diagnostics.Process]::new()
$process.StartInfo = $info
$null = $process.Start()
$stdoutTask = $process.StandardOutput.ReadToEndAsync()
$stderrTask = $process.StandardError.ReadToEndAsync()
$payload = ConvertTo-Json -InputObject $inputObject -Depth 5 -Compress
try {
  $process.StandardInput.Write($payload)
  $process.StandardInput.Close()
}
finally {
  $payload = $null
  $inputObject.localServiceRoleKey = $null
  $localKey = $null
}
$process.WaitForExit()
$stdout = $stdoutTask.GetAwaiter().GetResult()
$diagnostic = $stderrTask.GetAwaiter().GetResult()
if ($process.ExitCode -ne 0) {
  if (-not [string]::IsNullOrEmpty($keyForRedaction)) {
    $diagnostic = $diagnostic.Replace($keyForRedaction, '[local key redacted]')
  }
  $diagnostic = [Regex]::Replace($diagnostic, 'sb_(publishable|secret)_[A-Za-z0-9_-]+', '[Supabase key redacted]')
  $diagnostic = [Regex]::Replace($diagnostic, 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[token redacted]')
  $lines = @($diagnostic -split '\r?\n' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  $keyForRedaction = $null
  throw "Local Storage restore failed: $(($lines | Select-Object -Last 4) -join ' ')."
}
$keyForRedaction = $null
try {
  $result = ConvertFrom-Json -InputObject $stdout -ErrorAction Stop
}
catch {
  throw 'The local Storage restore helper returned an invalid result.'
}
Write-Host "Restored and hash-verified $($result.objectCount) receipt object(s), $($result.totalBytes) bytes, to local Supabase."
Write-Host 'This command changed local Storage only. It did not restore the SQL database or connect to a hosted project.'