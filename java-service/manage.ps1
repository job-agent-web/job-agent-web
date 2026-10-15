param(
  [ValidateSet('Build','Stage','Run','Check','Import','Preview','Deploy')][string]$Action = 'Build',
  [string]$EnvFile = '',
  [switch]$Apply
)
$ErrorActionPreference = 'Stop'
$serviceRoot = $PSScriptRoot
$projectRoot = Split-Path $serviceRoot -Parent
$toolDirectory = Join-Path $env:USERPROFILE '.cache\jobmatchagent-java-tools'
if ($EnvFile) {
  foreach ($line in [IO.File]::ReadAllLines((Resolve-Path -LiteralPath $EnvFile))) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
      $variableName = $matches[1]
      $variableValue = $matches[2]
      if (($variableValue.StartsWith('"') -and $variableValue.EndsWith('"')) -or ($variableValue.StartsWith("'") -and $variableValue.EndsWith("'"))) {
        $variableValue = $variableValue.Substring(1, $variableValue.Length - 2)
      }
      [Environment]::SetEnvironmentVariable($variableName, $variableValue, 'Process')
    }
  }
}
if (!$env:JAVA_HOME) {
  $candidate = Get-ChildItem -LiteralPath $toolDirectory -Directory -Filter 'jdk-21*' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($candidate) { $env:JAVA_HOME = $candidate.FullName }
}
$javaExecutable = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin\java.exe' } else { 'java' }
$mavenCommand = Get-Command mvn -ErrorAction SilentlyContinue
$mavenExecutable = if ($mavenCommand) { $mavenCommand.Source } else { Join-Path $toolDirectory 'apache-maven-3.9.11\bin\mvn.cmd' }
$packagePath = Join-Path $serviceRoot 'target\jobmatchagent.jar'
$stagingDirectory = Join-Path $projectRoot '.vercel\java-staging'
Push-Location $serviceRoot
try {
  if ($Action -eq 'Build') {
    & node (Join-Path $serviceRoot 'scripts\test-browser-bridge.cjs')
    if ($LASTEXITCODE -ne 0) { throw 'Browser API bridge checks failed.' }
    & node (Join-Path $serviceRoot 'scripts\test-frontend-workflows.cjs')
    if ($LASTEXITCODE -ne 0) { throw 'Frontend workflow checks failed.' }
    # Use the Windows trust store for the portable JDK on this machine.
    if ($IsWindows -or $env:OS -eq 'Windows_NT') { $env:MAVEN_OPTS = "$env:MAVEN_OPTS -Djavax.net.ssl.trustStoreType=Windows-ROOT -Djavax.net.ssl.trustStore=NONE" }
    & $mavenExecutable -B verify
    if ($LASTEXITCODE -ne 0) { throw 'Java build or tests failed.' }
    return
  }
  if ($Action -eq 'Stage' -or $Action -eq 'Preview' -or $Action -eq 'Deploy') {
    & node (Join-Path $serviceRoot 'scripts\stage.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Deployment staging failed.' }
    if ($Action -eq 'Stage') { return }
    Push-Location $stagingDirectory
    try {
      $env:NODE_OPTIONS = '--use-system-ca'
      if ($Action -eq 'Preview') { & npx.cmd --offline --yes vercel@63.1.2 deploy --yes --scope valourex001-7646s-projects }
      else { & npx.cmd --offline --yes vercel@63.1.2 deploy --prod --yes --scope valourex001-7646s-projects }
      if ($LASTEXITCODE -ne 0) { throw 'Vercel deployment failed. Verify login and environment configuration.' }
    } finally { Pop-Location }
    return
  }
  if (!(Test-Path -LiteralPath $packagePath)) { throw 'Build the Java package first: .\java-service\manage.ps1 -Action Build' }
  if ($Action -eq 'Check') { & $javaExecutable '-Djavax.net.ssl.trustStoreType=Windows-ROOT' '-Djavax.net.ssl.trustStore=NONE' -jar $packagePath doctor }
  elseif ($Action -eq 'Import') {
    if ($Apply) { & $javaExecutable '-Djavax.net.ssl.trustStoreType=Windows-ROOT' '-Djavax.net.ssl.trustStore=NONE' -jar $packagePath import-supabase --apply }
    else { & $javaExecutable '-Djavax.net.ssl.trustStoreType=Windows-ROOT' '-Djavax.net.ssl.trustStore=NONE' -jar $packagePath import-supabase }
  } else {
    & node (Join-Path $serviceRoot 'scripts\stage.mjs')
    $env:PUBLIC_DIR = Join-Path $stagingDirectory 'public'
    $env:PORT = '8080'
    $env:ALLOW_LOCAL_HTTP = 'true'
    & $javaExecutable '-Djavax.net.ssl.trustStoreType=Windows-ROOT' '-Djavax.net.ssl.trustStore=NONE' -jar $packagePath
  }
  if ($LASTEXITCODE -ne 0) { throw 'Java operation failed.' }
} finally { Pop-Location }
