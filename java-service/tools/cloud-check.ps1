param([ValidateSet('create','delete','summary','monthly','yearly','expired','login')][string]$Action='summary')
$ErrorActionPreference='Stop'
$projectRoot=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$toolRoot=Join-Path $env:USERPROFILE '.cache\jobmatchagent-java-tools'
$jdk=Join-Path $toolRoot 'jdk-21.0.12.1+1'
$secrets=Get-Content -Raw (Join-Path $projectRoot '.vercel\java-deployment-secrets.json')|ConvertFrom-Json
$env:SESSION_SIGNING_SECRET=$secrets.SESSION_SIGNING_SECRET
foreach($line in [IO.File]::ReadAllLines((Join-Path $projectRoot '.vercel\.env.java-production.local'))){
  if($line -match '^([A-Z][A-Z0-9_]*)=(.*)$'){
    $key=$matches[1];$value=$matches[2]
    if($value.StartsWith('"')){$value=ConvertFrom-Json $value}
    if($value -ne '[SENSITIVE]'){[Environment]::SetEnvironmentVariable($key,$value,'Process')}
  }
}
$classes=Join-Path $projectRoot '.vercel\java-cloud-check-classes'
New-Item -ItemType Directory -Force -Path $classes|Out-Null
$jar=Join-Path $projectRoot 'java-service\target\jobmatchagent.jar'
& (Join-Path $jdk 'bin\javac.exe') -cp $jar -d $classes (Join-Path $PSScriptRoot 'CloudVerification.java')
if($LASTEXITCODE -ne 0){throw 'Cloud verification helper did not compile.'}
& (Join-Path $jdk 'bin\java.exe') '-Djavax.net.ssl.trustStoreType=Windows-ROOT' '-Djavax.net.ssl.trustStore=NONE' -cp ($classes+';'+$jar) com.jobmatchagent.CloudVerification $Action (Join-Path $projectRoot '.vercel\java-qa-session.json')
if($LASTEXITCODE -ne 0){throw 'Cloud verification failed.'}
