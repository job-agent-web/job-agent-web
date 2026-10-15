param(
  [Parameter(Mandatory=$true)][string]$Deployment,
  [Parameter(Mandatory=$true)][string]$Path,
  [ValidateSet('GET','POST','PUT')][string]$Method='GET',
  [string]$BodyFile='',
  [switch]$Migration,
  [switch]$Session,
  [string]$Origin='',
  [string]$AdminPasskey='',
  [string]$OutputFile=''
)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$privateDirectory=Join-Path $projectRoot '.vercel'
$configFile=Join-Path $privateDirectory ('cloud-request-'+[Guid]::NewGuid().ToString('N')+'.config')
$headers=@('header = "Content-Type: application/json"','silent','show-error','max-time = 180',('request = "'+$Method+'"'))
if($Migration){
  $secrets=Get-Content -Raw (Join-Path $privateDirectory 'java-deployment-secrets.json')|ConvertFrom-Json
  $headers+='header = "X-Migration-Secret: '+$secrets.MIGRATION_CONTROL_SECRET+'"'
}
if($Session){
  $sessionData=Get-Content -Raw (Join-Path $privateDirectory 'java-qa-session.json')|ConvertFrom-Json
  $headers+='header = "Authorization: Bearer '+$sessionData.access_token+'"'
}
if($Origin){$headers+='header = "Origin: '+$Origin+'"'}
if($AdminPasskey){$headers+='header = "X-Admin-Secret: '+$AdminPasskey+'"'}
if($BodyFile){$resolvedBody=(Resolve-Path -LiteralPath $BodyFile).Path.Replace('\','/'); $headers+='data-binary = "@'+$resolvedBody+'"'}
[IO.File]::WriteAllLines($configFile,$headers,[Text.UTF8Encoding]::new($false))
$env:NODE_OPTIONS='--use-system-ca'
Push-Location $projectRoot
try {
  $result=& npx.cmd --offline --yes vercel@63.1.2 curl $Path --deployment $Deployment --scope valourex001-7646s-projects -- --config $configFile
  if($LASTEXITCODE -ne 0){throw 'Cloud request failed.'}
  $text=$result -join "`n"
  if($OutputFile){[IO.File]::WriteAllText($OutputFile,$text,[Text.UTF8Encoding]::new($false)); 'Cloud response retained in the private local verification file.'}
  else {$text}
} finally {
  Pop-Location
  # This exact file was created by this invocation inside the excluded deployment folder.
  if(Test-Path -LiteralPath $configFile){Remove-Item -LiteralPath $configFile}
}
