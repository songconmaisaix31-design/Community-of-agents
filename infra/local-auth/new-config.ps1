param(
  [Parameter(Mandatory=$true)][string]$ConfigDirectory,
  [string]$Project,
  [int]$PgPort,
  [int]$AuthPort,
  [int]$AppPort
)
$ErrorActionPreference = 'Stop'
$resolvedConfig = [IO.Path]::GetFullPath($ConfigDirectory)
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if ($resolvedConfig.StartsWith($repository, [StringComparison]::OrdinalIgnoreCase)) { throw 'Configuration must be outside Git workspace' }
if (Test-Path -LiteralPath $resolvedConfig) { throw 'Directory already exists; reuse its configuration without rotating secrets' }
$null = New-Item -ItemType Directory -Path $resolvedConfig
$acl = New-Object System.Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true, $false)
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
$acl.SetOwner($identity)
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
$acl.AddAccessRule($rule)
Set-Acl -LiteralPath $resolvedConfig -AclObject $acl
$profileArgs = @()
if ($Project -or $PgPort -or $AuthPort -or $AppPort) {
  $profileArgs = @('--project', $Project, '--pg-port', "$PgPort", '--auth-port', "$AuthPort", '--app-port', "$AppPort")
}
node (Join-Path $PSScriptRoot 'write-config.mjs') $resolvedConfig @profileArgs
if ($LASTEXITCODE -ne 0) { throw 'Configuration generation failed; preserve directory for review' }
